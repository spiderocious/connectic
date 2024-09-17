/**
 * connectic - Request/Response Management
 *
 * This file implements async request/response patterns over the event system
 * using correlation IDs, timeouts, retries, and intelligent caching.
 */

import {
  RequestOptions,
  RequestManyOptions,
  BatchRequest,
  PendingRequest,
} from '../types';
import { BusError, BusErrorFactory, wrapError, BusErrorCode } from '../errors';
import {
  validateParameters,
  generateId,
  delay,
  exponentialBackoff,
  safeExecuteAsync,
  isValidTimeout,
  isValidRetries,
} from './utils';
import { EventBus } from './event-bus';
import { CacheManager } from './cache';
import { ResponderBuilder } from './middleware';

/**
 * Manages request/response communication patterns
 */
export class RequestResponseManager {
  private pendingRequests = new Map<string, PendingRequest>();
  private responders = new Map<string, ResponderBuilder<any>>();
  private stats = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    timeoutRequests: 0,
    averageResponseTime: 0,
    totalResponseTime: 0,
  };
  private isDestroyed = false;
  private defaultOptions: Required<RequestOptions> = {
    timeout: 10000,
    retries: 0,
    priority: 'normal',
    cache: {},
    signal: new AbortController().signal,
  };

  constructor(
    private bus: EventBus,
    private cache: CacheManager
  ) {
    this.setupRequestHandler();
  }

  /**
   * Makes an async request and waits for response
   * @param event Event name
   * @param payload Request payload
   * @param options Request options
   * @returns Promise resolving to response
   */
  async request<T>(
    event: string,
    payload?: any,
    options?: RequestOptions
  ): Promise<T> {
    this.throwIfDestroyed();

    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    try {
      validateParameters(event);
      this.validateRequestOptions(opts);

      this.stats.totalRequests++;

      // Check cache first if caching is enabled
      if (opts.cache && Object.keys(opts.cache).length > 0) {
        const cacheKey = this.cache.createKey(event, payload);

        try {
          const cached = await this.cache.handleRequest(
            cacheKey,
            () => this.executeRequest<T>(event, payload, opts),
            opts.cache.strategy,
            opts.cache.ttl
          );

          this.updateStats(startTime, true);
          return cached;
        } catch (error) {
          // If cache strategy fails, fall through to direct request
          if (
            error instanceof BusError &&
            error.busCode === BusErrorCode.NOT_FOUND
          ) {
            // Cache-only strategy failed, re-throw
            throw error;
          }
        }
      }

      // Execute request directly
      const result = await this.executeRequest<T>(event, payload, opts);
      this.updateStats(startTime, true);
      return result;
    } catch (error) {
      this.updateStats(startTime, false);
      throw wrapError(error, `request:${event}`);
    }
  }

  /**
   * Collects multiple responses within timeout window
   * @param event Event name
   * @param payload Request payload
   * @param options Request options with multi-response settings
   * @returns Promise resolving to array of responses
   */
  async requestMany<T>(
    event: string,
    payload?: any,
    options?: RequestManyOptions
  ): Promise<T[]> {
    this.throwIfDestroyed();

    const startTime = Date.now();
    const opts = {
      ...this.defaultOptions,
      minResponses: 1,
      maxResponses: Number.MAX_SAFE_INTEGER,
      ...options,
    };

    try {
      validateParameters(event);
      this.validateRequestOptions(opts);

      this.stats.totalRequests++;

      const correlationId = generateId();
      const responses: T[] = [];
      let responseCount = 0;
      let resolved = false;

      return new Promise<T[]>((resolve, reject) => {
        // Set up response collector
        const responseHandler = (responsePayload: any) => {
          if (resolved || responsePayload.__correlationId !== correlationId) {
            return;
          }

          responses.push(responsePayload.response);
          responseCount++;

          // Check if we should resolve
          if (
            responseCount >= opts.minResponses! &&
            responseCount >= opts.maxResponses!
          ) {
            resolved = true;
            cleanup();
            this.updateStats(startTime, true);
            resolve(responses);
          }
        };

        // Set up timeout
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();

            if (responseCount >= opts.minResponses!) {
              this.updateStats(startTime, true);
              resolve(responses);
            } else {
              this.updateStats(startTime, false);
              reject(
                BusErrorFactory.timeout(event, opts.timeout, {
                  receivedResponses: responseCount,
                  minRequired: opts.minResponses,
                })
              );
            }
          }
        }, opts.timeout);

        // Set up cancellation
        const onAbort = () => {
          if (!resolved) {
            resolved = true;
            cleanup();
            this.updateStats(startTime, false);
            reject(BusErrorFactory.internal('Request was aborted'));
          }
        };

        if (opts.signal && !opts.signal.aborted) {
          opts.signal.addEventListener('abort', onAbort);
        } else if (opts.signal?.aborted) {
          onAbort();
          return;
        }

        const cleanup = () => {
          clearTimeout(timeoutId);
          if (opts.signal) {
            opts.signal.removeEventListener('abort', onAbort);
          }
          this.bus.off(`response:${correlationId}`, responseHandler);
        };

        // Listen for responses
        this.bus.on(`response:${correlationId}`, responseHandler);

        // Emit request
        this.bus.emit(event, {
          ...payload,
          __correlationId: correlationId,
          __expectMultiple: true,
        });
      });
    } catch (error) {
      this.updateStats(startTime, false);
      throw wrapError(error, `requestMany:${event}`);
    }
  }

  /**
   * Executes multiple requests in parallel
   * @param requests Array of batch requests
   * @returns Promise resolving to array of results
   */
  async requestBatch(requests: BatchRequest[]): Promise<any[]> {
    this.throwIfDestroyed();

    try {
      if (!Array.isArray(requests) || requests.length === 0) {
        throw BusErrorFactory.badRequest(
          'requestBatch',
          'Requests must be a non-empty array',
          { requests }
        );
      }

      // Execute all requests in parallel
      const promises = requests.map(([event, payload, options], index) => {
        return this.request(event, payload, options).catch(error => {
          // Don't fail entire batch for individual failures
          return { __error: error, __index: index } as {
            __error: any;
            __index: number;
          };
        });
      });

      const results = await Promise.all(promises);

      // Type guard for error results
      const isErrorResult = (
        result: any
      ): result is { __error: any; __index: number } =>
        result && typeof result === 'object' && '__error' in result;

      // Check for errors and re-throw if needed
      const errors = results.filter(isErrorResult);
      if (errors.length > 0) {
        console.warn(`Batch request had ${errors.length} failures:`, errors);
      }

      return results;
    } catch (error) {
      throw wrapError(error, 'requestBatch');
    }
  }

  /**
   * Sets up a responder for handling requests
   * @param event Event name to respond to
   * @returns ResponderBuilder for configuring middleware and handler
   */
  respond<K>(event: string): ResponderBuilder<K> {
    this.throwIfDestroyed();

    try {
      validateParameters(event);

      // Check if responder already exists
      if (this.responders.has(event)) {
        console.warn(
          `Responder for event "${event}" already exists. Creating new one.`
        );
      }

      const responder = new ResponderBuilder<K>(event, this.bus);
      this.responders.set(event, responder);

      return responder;
    } catch (error) {
      throw wrapError(error, `respond:${event}`);
    }
  }

  /**
   * Gets statistics about request/response usage
   * @returns Request/response statistics
   */
  getStats(): object {
    return {
      ...this.stats,
      pendingRequests: this.pendingRequests.size,
      responderCount: this.responders.size,
      successRate:
        this.stats.totalRequests > 0
          ? this.stats.completedRequests / this.stats.totalRequests
          : 0,
      isDestroyed: this.isDestroyed,
    };
  }

  /**
   * Gets detailed information about pending requests and responders
   * @returns Detailed request/response information
   */
  getDetailedInfo(): object {
    const pendingDetails: Record<string, any> = {};
    const responderDetails: Record<string, any> = {};

    this.pendingRequests.forEach((request, id) => {
      pendingDetails[id] = {
        timeout: request.options.timeout,
        retries: request.options.retries,
        priority: request.options.priority,
        startTime: Date.now() - (request.options.timeout ?? 0), // Approximate
      };
    });

    this.responders.forEach((responder, event) => {
      responderDetails[event] = (responder as any).getInfo();
    });

    return {
      pending: pendingDetails,
      responders: responderDetails,
      stats: this.getStats(),
    };
  }

  /**
   * Destroys the request/response manager and cleans up resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      // Reject all pending requests
      this.pendingRequests.forEach((request, id) => {
        try {
          clearTimeout(request.timeout);
          request.reject(
            BusErrorFactory.gone('request-response', 'Manager destroyed')
          );
        } catch (error) {
          console.warn(`Error rejecting pending request ${id}:`, error);
        }
      });

      this.pendingRequests.clear();
      this.responders.clear();
      this.isDestroyed = true;
    } catch (error) {
      this.isDestroyed = true;
      throw wrapError(error, 'requestResponseManager.destroy');
    }
  }

  /**
   * Checks if request/response manager is destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Executes a single request with retries
   * @private
   */
  private async executeRequest<T>(
    event: string,
    payload: any,
    options: Required<RequestOptions>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= options.retries; attempt++) {
      try {
        // Add delay for retries
        if (attempt > 0) {
          const delay = exponentialBackoff(attempt - 1);
          await this.delay(delay);
        }

        return await this.executeSingleRequest<T>(event, payload, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry certain error types
        if (error instanceof BusError) {
          if (!error.isRetryable()) {
            throw error;
          }
        }

        // Don't retry if aborted
        if (options.signal?.aborted) {
          throw BusErrorFactory.internal('Request was aborted');
        }
      }
    }

    // All retries failed
    this.stats.failedRequests++;
    throw lastError || BusErrorFactory.internal('Request failed after retries');
  }

  /**
   * Executes a single request attempt
   * @private
   */
  private async executeSingleRequest<T>(
    event: string,
    payload: any,
    options: Required<RequestOptions>
  ): Promise<T> {
    const correlationId = generateId();

    return new Promise<T>((resolve, reject) => {
      let resolved = false;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          this.stats.timeoutRequests++;
          reject(BusErrorFactory.timeout(event, options.timeout));
        }
      }, options.timeout);

      // Set up cancellation
      const onAbort = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(BusErrorFactory.internal('Request was aborted'));
        }
      };

      if (options.signal && !options.signal.aborted) {
        options.signal.addEventListener('abort', onAbort);
      } else if (options.signal?.aborted) {
        onAbort();
        return;
      }

      // Set up response handler
      const responseHandler = (responsePayload: any) => {
        if (resolved || responsePayload.__correlationId !== correlationId) {
          return;
        }

        resolved = true;
        cleanup();

        if (responsePayload.__error) {
          reject(wrapError(responsePayload.__error, event));
        } else {
          resolve(responsePayload.response);
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (options.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
        this.bus.off(`response:${correlationId}`, responseHandler);
        this.pendingRequests.delete(correlationId);
      };

      // Store pending request info
      this.pendingRequests.set(correlationId, {
        resolve,
        reject,
        timeout: timeoutId,
        options,
      });

      // Listen for response
      this.bus.on(`response:${correlationId}`, responseHandler);

      // Emit request
      this.bus.emit(event, {
        ...payload,
        __correlationId: correlationId,
      });
    });
  }

  /**
   * Sets up the request handler that coordinates request/response flow
   * @private
   */
  private setupRequestHandler(): void {
    // This would be implemented to handle incoming requests and route them
    // to appropriate responders. The actual implementation would depend on
    // how responders are registered and managed.
  }

  /**
   * Validates request options
   * @private
   */
  private validateRequestOptions(options: RequestOptions): void {
    if (options.timeout !== undefined && !isValidTimeout(options.timeout)) {
      throw BusErrorFactory.badRequest('request', 'Invalid timeout value', {
        timeout: options.timeout,
      });
    }

    if (options.retries !== undefined && !isValidRetries(options.retries)) {
      throw BusErrorFactory.badRequest('request', 'Invalid retries value', {
        retries: options.retries,
      });
    }

    if (
      options.priority &&
      !['low', 'normal', 'high'].includes(options.priority)
    ) {
      throw BusErrorFactory.badRequest('request', 'Invalid priority value', {
        priority: options.priority,
      });
    }
  }

  /**
   * Updates statistics after request completion
   * @private
   */
  private updateStats(startTime: number, success: boolean): void {
    const responseTime = Date.now() - startTime;

    if (success) {
      this.stats.completedRequests++;
    } else {
      this.stats.failedRequests++;
    }

    this.stats.totalResponseTime += responseTime;
    this.stats.averageResponseTime =
      this.stats.totalResponseTime /
      (this.stats.completedRequests + this.stats.failedRequests);
  }

  /**
   * Promise-based delay utility
   * @private
   */
  private delay(ms: number): Promise<void> {
    return delay(ms);
  }

  /**
   * Throws error if request/response manager is destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone(
        'requestResponse',
        'Request/response manager has been destroyed'
      );
    }
  }
}

/**
 * Utility functions for request/response patterns
 */
export class RequestResponseUtils {
  /**
   * Creates a timeout wrapper for any async function
   * @param fn Async function to wrap
   * @param timeoutMs Timeout in milliseconds
   * @returns Wrapped function with timeout
   */
  static withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): () => Promise<T> {
    return async () => {
      return Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          setTimeout(() => {
            reject(BusErrorFactory.timeout('function', timeoutMs));
          }, timeoutMs);
        }),
      ]);
    };
  }

  /**
   * Creates a retry wrapper for any async function
   * @param fn Async function to wrap
   * @param maxRetries Maximum number of retries
   * @param backoffMs Base backoff delay
   * @returns Wrapped function with retry logic
   */
  static withRetries<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    backoffMs: number = 1000
  ): () => Promise<T> {
    return async () => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            await delay(exponentialBackoff(attempt - 1, backoffMs));
          }
          return await fn();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }

      throw lastError;
    };
  }

  /**
   * Creates a circuit breaker for requests
   * @param failureThreshold Number of failures before opening circuit
   * @param resetTimeoutMs Time before attempting to close circuit
   * @returns Circuit breaker function
   */
  static createCircuitBreaker<T>(
    failureThreshold: number,
    resetTimeoutMs: number
  ): (fn: () => Promise<T>) => Promise<T> {
    let failureCount = 0;
    let lastFailureTime = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';

    return async (fn: () => Promise<T>): Promise<T> => {
      const now = Date.now();

      // Check if we should try to close the circuit
      if (state === 'open' && now - lastFailureTime > resetTimeoutMs) {
        state = 'half-open';
      }

      // Reject immediately if circuit is open
      if (state === 'open') {
        throw BusErrorFactory.serviceUnavailable(
          'circuit-breaker',
          resetTimeoutMs - (now - lastFailureTime)
        );
      }

      try {
        const result = await fn();

        // Success - reset failure count and close circuit
        failureCount = 0;
        state = 'closed';
        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = now;

        // Open circuit if threshold reached
        if (failureCount >= failureThreshold) {
          state = 'open';
        }

        throw error;
      }
    };
  }
}
