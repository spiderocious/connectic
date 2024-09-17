/**
 * connectic - Interceptor Management
 *
 * This file implements request and response interceptors for transforming
 * data flowing through the bus system.
 */

import { BusErrorFactory, wrapError } from '../errors';
import { RequestInterceptor, ResponseInterceptor } from '../types';
import { deepClone, safeExecute } from './utils';

/**
 * Manages request and response interceptors
 */
export class InterceptorManager {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private isDestroyed = false;
  private stats = {
    requestInterceptions: 0,
    responseInterceptions: 0,
    requestErrors: 0,
    responseErrors: 0,
  };

  /**
   * Adds a request interceptor
   * @param interceptor Function to intercept and transform requests
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.throwIfDestroyed();

    try {
      if (typeof interceptor !== 'function') {
        throw BusErrorFactory.badRequest(
          'addRequestInterceptor',
          'Interceptor must be a function',
          { interceptor: typeof interceptor }
        );
      }

      this.requestInterceptors.push(interceptor);
    } catch (error) {
      throw wrapError(error, 'addRequestInterceptor');
    }
  }

  /**
   * Adds a response interceptor
   * @param interceptor Function to intercept and transform responses
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.throwIfDestroyed();

    try {
      if (typeof interceptor !== 'function') {
        throw BusErrorFactory.badRequest(
          'addResponseInterceptor',
          'Interceptor must be a function',
          { interceptor: typeof interceptor }
        );
      }

      this.responseInterceptors.push(interceptor);
    } catch (error) {
      throw wrapError(error, 'addResponseInterceptor');
    }
  }

  /**
   * Removes a request interceptor
   * @param interceptor Interceptor function to remove
   * @returns True if interceptor was removed
   */
  removeRequestInterceptor(interceptor: RequestInterceptor): boolean {
    this.throwIfDestroyed();

    try {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.requestInterceptors.splice(index, 1);
        return true;
      }
      return false;
    } catch (error) {
      throw wrapError(error, 'removeRequestInterceptor');
    }
  }

  /**
   * Removes a response interceptor
   * @param interceptor Interceptor function to remove
   * @returns True if interceptor was removed
   */
  removeResponseInterceptor(interceptor: ResponseInterceptor): boolean {
    this.throwIfDestroyed();

    try {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index > -1) {
        this.responseInterceptors.splice(index, 1);
        return true;
      }
      return false;
    } catch (error) {
      throw wrapError(error, 'removeResponseInterceptor');
    }
  }

  /**
   * Applies all request interceptors to a request
   * @param event Event name
   * @param payload Original payload
   * @returns Transformed payload
   */
  applyRequestInterceptors(event: string, payload: any): any {
    this.throwIfDestroyed();

    try {
      if (this.requestInterceptors.length === 0) {
        return payload;
      }

      let transformedPayload = deepClone(payload);

      for (let i = 0; i < this.requestInterceptors.length; i++) {
        const interceptor = this.requestInterceptors[i];

        const result = safeExecute(
          () => interceptor(event, transformedPayload),
          `request interceptor #${i} for event '${event}'`
        );

        if (result !== undefined) {
          transformedPayload = result;
        }
      }

      this.stats.requestInterceptions++;
      return transformedPayload;
    } catch (error) {
      this.stats.requestErrors++;
      throw wrapError(error, `applyRequestInterceptors:${event}`);
    }
  }

  /**
   * Applies all response interceptors to a response
   * @param event Event name
   * @param response Original response
   * @returns Transformed response
   */
  applyResponseInterceptors(event: string, response: any): any {
    this.throwIfDestroyed();

    try {
      if (this.responseInterceptors.length === 0) {
        return response;
      }

      let transformedResponse = deepClone(response);

      for (let i = 0; i < this.responseInterceptors.length; i++) {
        const interceptor = this.responseInterceptors[i];

        const result = safeExecute(
          () => interceptor(event, transformedResponse),
          `response interceptor #${i} for event '${event}'`
        );

        if (result !== undefined) {
          transformedResponse = result;
        }
      }

      this.stats.responseInterceptions++;
      return transformedResponse;
    } catch (error) {
      this.stats.responseErrors++;
      throw wrapError(error, `applyResponseInterceptors:${event}`);
    }
  }

  /**
   * Gets the number of registered interceptors
   * @returns Interceptor counts
   */
  getInterceptorCounts(): { request: number; response: number } {
    return {
      request: this.requestInterceptors.length,
      response: this.responseInterceptors.length,
    };
  }

  /**
   * Gets statistics about interceptor usage
   * @returns Interceptor statistics
   */
  getStats(): object {
    const counts = this.getInterceptorCounts();

    return {
      ...this.stats,
      ...counts,
      totalInterceptors: counts.request + counts.response,
      requestSuccessRate:
        this.stats.requestInterceptions > 0
          ? (this.stats.requestInterceptions - this.stats.requestErrors) /
            this.stats.requestInterceptions
          : 1,
      responseSuccessRate:
        this.stats.responseInterceptions > 0
          ? (this.stats.responseInterceptions - this.stats.responseErrors) /
            this.stats.responseInterceptions
          : 1,
      isDestroyed: this.isDestroyed,
    };
  }

  /**
   * Clears all interceptors
   */
  clear(): void {
    this.throwIfDestroyed();

    try {
      this.requestInterceptors = [];
      this.responseInterceptors = [];
    } catch (error) {
      throw wrapError(error, 'interceptorManager.clear');
    }
  }

  /**
   * Destroys the interceptor manager and cleans up resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      this.clear();
      this.isDestroyed = true;
    } catch (error) {
      this.isDestroyed = true;
      throw wrapError(error, 'interceptorManager.destroy');
    }
  }

  /**
   * Checks if interceptor manager is destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Throws error if interceptor manager is destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone(
        'interceptorManager',
        'Interceptor manager has been destroyed'
      );
    }
  }
}

/**
 * Built-in interceptor functions for common use cases
 */
export class BuiltinInterceptors {
  /**
   * Creates an interceptor that adds timestamp to all requests
   * @param field Field name to add timestamp (default: 'timestamp')
   * @returns Request interceptor
   */
  static addTimestamp(field: string = 'timestamp'): RequestInterceptor {
    return (event: string, payload: any) => {
      const timestamp = new Date().toISOString();
      return {
        ...payload,
        event,
        [field]: timestamp,
      };
    };
  }

  /**
   * Creates an interceptor that validates response payloads
   * @param validator Validation function
   * @returns Response interceptor
   */
  static validateResponse(
    validator: (event: string, response: any) => boolean | string
  ): ResponseInterceptor {
    return (event: string, response: any) => {
      const result = validator(event, response);

      if (result === true) {
        return response;
      }

      const errorMessage =
        typeof result === 'string' ? result : 'Response validation failed';
      throw BusErrorFactory.unprocessableEntity(event, errorMessage, {
        response,
      });
    };
  }

  /**
   * Creates an interceptor that transforms response data
   * @param transformer Transformation function
   * @returns Response interceptor
   */
  static transformResponse(
    transformer: (event: string, response: any) => any
  ): ResponseInterceptor {
    return (event: string, response: any) => {
      try {
        return transformer(event, response);
      } catch (error) {
        throw wrapError(error, `transformResponse:${event}`);
      }
    };
  }

  /**
   * Creates an interceptor that logs all responses
   * @param logger Logging function (defaults to console.log)
   * @param options Logging options
   * @returns Response interceptor
   */
  static logResponses(
    logger: (message: string, data?: any) => void = console.log,
    options: { includeResponse?: boolean; prefix?: string } = {}
  ): ResponseInterceptor {
    const { includeResponse = true, prefix = '[RESPONSE]' } = options;

    return (event: string, response: any) => {
      const timestamp = new Date().toISOString();

      if (includeResponse) {
        logger(`${prefix} ${timestamp} ${event}`, response);
      } else {
        logger(`${prefix} ${timestamp} ${event}`);
      }

      return response;
    };
  }

  /**
   * Creates an interceptor that adds metadata to responses
   * @param metadata Metadata to add
   * @returns Response interceptor
   */
  static addResponseMetadata(
    metadata:
      | Record<string, any>
      | ((event: string, response: any) => Record<string, any>)
  ): ResponseInterceptor {
    return (event: string, response: any) => {
      const meta =
        typeof metadata === 'function' ? metadata(event, response) : metadata;

      return {
        data: response,
        metadata: {
          timestamp: Date.now(),
          event,
          ...meta,
        },
      };
    };
  }

  /**
   * Creates an interceptor that normalizes response format
   * @param format Response format configuration
   * @returns Response interceptor
   */
  static normalizeResponse(
    format: {
      dataField?: string;
      errorField?: string;
      successField?: string;
    } = {}
  ): ResponseInterceptor {
    const {
      dataField = 'data',
      errorField = 'error',
      successField = 'success',
    } = format;

    return (event: string, response: any) => {
      // If response is already normalized, return as-is
      if (response && typeof response === 'object' && dataField in response) {
        return response;
      }

      // Normalize response
      return {
        [successField]: true,
        [dataField]: response,
        [errorField]: null,
      };
    };
  }

  /**
   * Creates an interceptor that handles errors in responses
   * @param errorHandler Error handling function
   * @returns Response interceptor
   */
  static handleResponseErrors(
    errorHandler: (event: string, error: any) => any
  ): ResponseInterceptor {
    return (event: string, response: any) => {
      // Check if response indicates an error
      if (response && typeof response === 'object') {
        if (response.error || response.success === false) {
          return errorHandler(event, response);
        }
      }

      return response;
    };
  }

  /**
   * Creates an interceptor that filters sensitive data from requests
   * @param sensitiveFields Array of field names to filter
   * @param replacement Replacement value (default: '[FILTERED]')
   * @returns Request interceptor
   */
  static filterSensitiveData(
    sensitiveFields: string[],
    replacement: any = '[FILTERED]'
  ): RequestInterceptor {
    return (event: string, payload: any) => {
      if (!payload || typeof payload !== 'object') {
        return payload;
      }

      const filtered = { ...payload };

      sensitiveFields.forEach(field => {
        if (field in filtered) {
          filtered[field] = replacement;
        }
      });

      return filtered;
    };
  }

  /**
   * Creates an interceptor that adds retry information to requests
   * @param getRetryCount Function to get current retry count
   * @returns Request interceptor
   */
  static addRetryInfo(
    getRetryCount: (event: string) => number
  ): RequestInterceptor {
    return (event: string, payload: any) => {
      const retryCount = getRetryCount(event);

      return {
        ...payload,
        __retryCount: retryCount,
        __isRetry: retryCount > 0,
      };
    };
  }

  /**
   * Creates an interceptor that adds performance metrics
   * @param performanceTracker Performance tracking function
   * @returns Response interceptor
   */
  static addPerformanceMetrics(
    performanceTracker: (
      event: string,
      startTime: number,
      endTime: number
    ) => void
  ): ResponseInterceptor {
    const requestTimes = new Map<string, number>();

    // Return a combo interceptor that tracks both request and response
    return {
      request: (event: string, payload: any) => {
        requestTimes.set(event, Date.now());
        return payload;
      },
      response: (event: string, response: any) => {
        const startTime = requestTimes.get(event);
        if (startTime) {
          const endTime = Date.now();
          performanceTracker(event, startTime, endTime);
          requestTimes.delete(event);
        }
        return response;
      },
    } as any; // Type assertion for dual interceptor
  }

  /**
   * Creates an interceptor that implements rate limiting
   * @param limit Number of requests per window
   * @param windowMs Time window in milliseconds
   * @returns Request interceptor
   */
  static rateLimit(limit: number, windowMs: number): RequestInterceptor {
    const requests = new Map<string, number[]>();

    return (event: string, payload: any) => {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get or create request history for this event
      const eventRequests = requests.get(event) || [];

      // Filter out old requests
      const recentRequests = eventRequests.filter(time => time > windowStart);

      // Check rate limit
      if (recentRequests.length >= limit) {
        throw BusErrorFactory.tooManyRequests(event, limit, windowMs);
      }

      // Add current request
      recentRequests.push(now);
      requests.set(event, recentRequests);

      return payload;
    };
  }

  /**
   * Creates an interceptor that implements circuit breaker pattern
   * @param failureThreshold Number of failures before opening circuit
   * @param resetTimeoutMs Time before attempting to close circuit
   * @returns Request interceptor
   */
  static circuitBreaker(
    failureThreshold: number,
    resetTimeoutMs: number
  ): RequestInterceptor {
    const circuits = new Map<
      string,
      {
        failures: number;
        lastFailure: number;
        state: 'closed' | 'open' | 'half-open';
      }
    >();

    return (event: string, payload: any) => {
      const circuit = circuits.get(event) || {
        failures: 0,
        lastFailure: 0,
        state: 'closed' as const,
      };

      const now = Date.now();

      // Check if we should attempt to close the circuit
      if (
        circuit.state === 'open' &&
        now - circuit.lastFailure > resetTimeoutMs
      ) {
        circuit.state = 'half-open';
      }

      // Reject if circuit is open
      if (circuit.state === 'open') {
        throw BusErrorFactory.serviceUnavailable(
          event,
          resetTimeoutMs - (now - circuit.lastFailure)
        );
      }

      circuits.set(event, circuit);
      return payload;
    };
  }
}

/**
 * Utility functions for working with interceptors
 */
export class InterceptorUtils {
  /**
   * Combines multiple request interceptors into a single interceptor
   * @param interceptors Array of request interceptors
   * @returns Combined request interceptor
   */
  static combineRequestInterceptors(
    interceptors: RequestInterceptor[]
  ): RequestInterceptor {
    return (event: string, payload: any) => {
      return interceptors.reduce((currentPayload, interceptor) => {
        const result = interceptor(event, currentPayload);
        return result !== undefined ? result : currentPayload;
      }, payload);
    };
  }

  /**
   * Combines multiple response interceptors into a single interceptor
   * @param interceptors Array of response interceptors
   * @returns Combined response interceptor
   */
  static combineResponseInterceptors(
    interceptors: ResponseInterceptor[]
  ): ResponseInterceptor {
    return (event: string, response: any) => {
      return interceptors.reduce((currentResponse, interceptor) => {
        const result = interceptor(event, currentResponse);
        return result !== undefined ? result : currentResponse;
      }, response);
    };
  }

  /**
   * Creates a conditional interceptor that only runs for specific events
   * @param condition Event matcher (string, regex, or function)
   * @param interceptor Interceptor to run conditionally
   * @returns Conditional request interceptor
   */
  static conditionalRequest(
    condition: string | RegExp | ((event: string) => boolean),
    interceptor: RequestInterceptor
  ): RequestInterceptor {
    const matcher = this.createEventMatcher(condition);

    return (event: string, payload: any) => {
      if (matcher(event)) {
        return interceptor(event, payload);
      }
      return payload;
    };
  }

  /**
   * Creates a conditional response interceptor
   * @param condition Event matcher (string, regex, or function)
   * @param interceptor Interceptor to run conditionally
   * @returns Conditional response interceptor
   */
  static conditionalResponse(
    condition: string | RegExp | ((event: string) => boolean),
    interceptor: ResponseInterceptor
  ): ResponseInterceptor {
    const matcher = this.createEventMatcher(condition);

    return (event: string, response: any) => {
      if (matcher(event)) {
        return interceptor(event, response);
      }
      return response;
    };
  }

  /**
   * Creates an event matcher function from various condition types
   * @private
   */
  private static createEventMatcher(
    condition: string | RegExp | ((event: string) => boolean)
  ): (event: string) => boolean {
    if (typeof condition === 'string') {
      return (event: string) => event === condition;
    }

    if (condition instanceof RegExp) {
      return (event: string) => condition.test(event);
    }

    if (typeof condition === 'function') {
      return condition;
    }

    throw new Error('Invalid condition type for event matcher');
  }

  /**
   * Creates an interceptor that only runs once per event
   * @param interceptor Interceptor to run once
   * @returns One-time interceptor
   */
  static once<T extends RequestInterceptor | ResponseInterceptor>(
    interceptor: T
  ): T {
    const executed = new Set<string>();

    return ((event: string, data: any) => {
      if (executed.has(event)) {
        return data;
      }

      executed.add(event);
      return interceptor(event, data);
    }) as T;
  }

  /**
   * Creates a debounced interceptor that only runs after a delay
   * @param interceptor Interceptor to debounce
   * @param delayMs Debounce delay in milliseconds
   * @returns Debounced interceptor
   */
  static debounce<T extends RequestInterceptor | ResponseInterceptor>(
    interceptor: T,
    delayMs: number
  ): T {
    const timeouts = new Map<string, NodeJS.Timeout>();

    return ((event: string, data: any) => {
      // Clear existing timeout for this event
      const existingTimeout = timeouts.get(event);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set new timeout
      const timeout = setTimeout(() => {
        interceptor(event, data);
        timeouts.delete(event);
      }, delayMs);

      timeouts.set(event, timeout);

      // Return data unchanged for immediate processing
      return data;
    }) as T;
  }

  /**
   * Creates an interceptor that adds a timestamp to all requests
   * @param field Field name for timestamp (default: 'timestamp')
   * @returns Request interceptor
   */
  static addTimestamp(field: string = 'timestamp'): RequestInterceptor {
    return (event: string, payload: any) => {
      return {
        ...payload,
        [field]: Date.now(),
      };
    };
  }

  /**
   * Creates an interceptor that adds request ID to all requests
   * @param field Field name for request ID (default: 'requestId')
   * @returns Request interceptor
   */
  static addRequestId(field: string = 'requestId'): RequestInterceptor {
    return (event: string, payload: any) => {
      return {
        ...payload,
        [field]: `${event}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
    };
  }

  /**
   * Creates an interceptor that adds authentication headers
   * @param getToken Function to get authentication token
   * @param field Field name for auth token (default: 'authToken')
   * @returns Request interceptor
   */
  static addAuthentication(
    getToken: () => string | null,
    field: string = 'authToken'
  ): RequestInterceptor {
    return (event: string, payload: any) => {
      const token = getToken();
      if (token) {
        return {
          ...payload,
          [field]: token,
        };
      }
      return payload;
    };
  }

  /**
   * Creates an interceptor that validates request payloads
   * @param validator Validation function
   * @returns Request interceptor
   */
  static validateRequest(
    validator: (event: string, payload: any) => boolean | string
  ): RequestInterceptor {
    return (event: string, payload: any) => {
      const result = validator(event, payload);

      if (result === true) {
        return payload;
      }

      const errorMessage =
        typeof result === 'string' ? result : 'Request validation failed';
      throw BusErrorFactory.unprocessableEntity(event, errorMessage, {
        payload,
      });
    };
  }

  /**
   * Creates an interceptor that transforms request data
   * @param transformer Transformation function
   * @returns Request interceptor
   */
  static transformRequest(
    transformer: (event: string, payload: any) => any
  ): RequestInterceptor {
    return (event: string, payload: any) => {
      try {
        return transformer(event, payload);
      } catch (error) {
        throw wrapError(error, `transformRequest:${event}`);
      }
    };
  }

  /**
   * Creates an interceptor that logs all requests
   * @param logger Logging function (defaults to console.log)
   * @param options Logging options
   * @returns Request interceptor
   */
  static logRequests(
    logger: (message: string, data?: any) => void = console.log,
    options: { includePayload?: boolean; prefix?: string } = {}
  ): RequestInterceptor {
    const { includePayload = true, prefix = '[REQUEST]' } = options;

    return (event: string, payload: any) => {
      const timestamp = new Date().toISOString();

      if (includePayload) {
        logger(`${prefix} ${timestamp} ${event}`, payload);
      } else {
        logger(`${prefix} ${timestamp} ${event}`);
      }

      return payload;
    };
  }
}
