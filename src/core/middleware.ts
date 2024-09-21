/**
 * connectic - Middleware and Plugin System
 *
 * This file implements the plugin architecture and middleware system for connectic.
 * It provides lifecycle hooks and extensible middleware chains for responders.
 */

import { BusError, BusErrorFactory, wrapError } from '../errors';
import { BusPlugin, HookHandler, HookType, MiddlewareFunction } from '../types';
import { EventBus } from './event-bus';
import { safeExecute } from './utils';

/**
 * Manages plugins and lifecycle hooks for a bus instance
 */
export class MiddlewareManager {
  private hooks: Record<HookType, HookHandler[]> = {
    beforeEmit: [],
    afterEmit: [],
    beforeOn: [],
    afterOn: [],
  };
  private plugins: BusPlugin[] = [];
  private isDestroyed = false;

  constructor(private bus: any) {} // Bus reference for plugin installation

  /**
   * Adds a plugin to the bus
   * @param plugin Plugin to install
   */
  addPlugin(plugin: BusPlugin): void {
    this.throwIfDestroyed();

    try {
      // Validate plugin structure
      if (!plugin || typeof plugin !== 'object') {
        throw BusErrorFactory.badRequest(
          'addPlugin',
          'Plugin must be an object',
          { plugin }
        );
      }

      if (typeof plugin.name !== 'string' || !plugin.name.trim()) {
        throw BusErrorFactory.badRequest(
          'addPlugin',
          'Plugin must have a non-empty name',
          { plugin: plugin.name }
        );
      }

      if (typeof plugin.install !== 'function') {
        throw BusErrorFactory.badRequest(
          'addPlugin',
          'Plugin must have an install function',
          { plugin: plugin.name }
        );
      }

      // Check for duplicate plugin names
      if (this.plugins.some(p => p.name === plugin.name)) {
        throw BusErrorFactory.conflict('addPlugin', 1, {
          message: `Plugin "${plugin.name}" is already installed`,
        });
      }

      // Install the plugin
      plugin.install(this.bus);
      this.plugins.push(plugin);
    } catch (error) {
      throw wrapError(error, `addPlugin:${plugin?.name || 'unknown'}`);
    }
  }

  /**
   * Removes a plugin by name
   * @param pluginName Name of plugin to remove
   * @returns True if plugin was removed
   */
  removePlugin(pluginName: string): boolean {
    this.throwIfDestroyed();

    try {
      const pluginIndex = this.plugins.findIndex(p => p.name === pluginName);
      if (pluginIndex === -1) {
        return false;
      }

      const plugin = this.plugins[pluginIndex];

      // Call uninstall if available
      if (typeof plugin.uninstall === 'function') {
        try {
          plugin.uninstall(this.bus);
        } catch (error) {
          console.warn(`Error uninstalling plugin "${pluginName}":`, error);
        }
      }

      // Remove from plugins array
      this.plugins.splice(pluginIndex, 1);
      return true;
    } catch (error) {
      throw wrapError(error, `removePlugin:${pluginName}`);
    }
  }

  /**
   * Gets all installed plugins
   * @returns Array of plugin names
   */
  getPlugins(): string[] {
    return this.plugins.map(p => p.name);
  }

  /**
   * Checks if a plugin is installed
   * @param pluginName Plugin name to check
   * @returns True if plugin is installed
   */
  hasPlugin(pluginName: string): boolean {
    return this.plugins.some(p => p.name === pluginName);
  }

  /**
   * Adds a lifecycle hook
   * @param type Hook type
   * @param handler Hook handler function
   */
  addHook(type: HookType, handler: HookHandler): void {
    this.throwIfDestroyed();

    try {
      if (!this.hooks[type]) {
        throw BusErrorFactory.badRequest(
          'addHook',
          `Invalid hook type: ${type}`,
          { type, validTypes: Object.keys(this.hooks) }
        );
      }

      if (typeof handler !== 'function') {
        throw BusErrorFactory.badRequest(
          'addHook',
          'Hook handler must be a function',
          { type, handler: typeof handler }
        );
      }

      this.hooks[type].push(handler);
    } catch (error) {
      throw wrapError(error, `addHook:${type}`);
    }
  }

  /**
   * Removes a specific lifecycle hook
   * @param type Hook type
   * @param handler Hook handler to remove
   */
  removeHook(type: HookType, handler: HookHandler): void {
    this.throwIfDestroyed();

    try {
      if (!this.hooks[type]) {
        throw BusErrorFactory.badRequest(
          'removeHook',
          `Invalid hook type: ${type}`,
          { type, validTypes: Object.keys(this.hooks) }
        );
      }

      const hooks = this.hooks[type];
      const index = hooks.indexOf(handler);

      if (index > -1) {
        hooks.splice(index, 1);
      }
    } catch (error) {
      throw wrapError(error, `removeHook:${type}`);
    }
  }

  /**
   * Executes all hooks of a specific type
   * @param type Hook type to execute
   * @param event Event name
   * @param payload Optional payload
   */
  runHooks(type: HookType, event: string, payload?: any): void {
    this.throwIfDestroyed();

    try {
      const hooks = this.hooks[type];
      if (!hooks || hooks.length === 0) {
        return;
      }

      hooks.forEach((hook, index) => {
        safeExecute(
          () => hook(event, payload),
          `${type} hook #${index} for event '${event}'`
        );
      });
    } catch (error) {
      throw wrapError(error, `runHooks:${type}:${event}`);
    }
  }

  /**
   * Gets statistics about middleware usage
   * @returns Middleware statistics
   */
  getStats(): object {
    return {
      pluginCount: this.plugins.length,
      plugins: this.plugins.map(p => p.name),
      hookCounts: {
        beforeEmit: this.hooks.beforeEmit.length,
        afterEmit: this.hooks.afterEmit.length,
        beforeOn: this.hooks.beforeOn.length,
        afterOn: this.hooks.afterOn.length,
      },
      totalHooks: Object.values(this.hooks).reduce(
        (sum, hooks) => sum + hooks.length,
        0
      ),
      isDestroyed: this.isDestroyed,
    };
  }

  /**
   * Destroys the middleware manager and cleans up resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      // Uninstall all plugins
      [...this.plugins].forEach(plugin => {
        try {
          if (typeof plugin.uninstall === 'function') {
            plugin.uninstall(this.bus);
          }
        } catch (error) {
          console.warn(
            `Error uninstalling plugin "${plugin.name}" during destroy:`,
            error
          );
        }
      });

      // Clear all hooks and plugins
      Object.keys(this.hooks).forEach(key => {
        this.hooks[key as HookType] = [];
      });
      this.plugins = [];

      this.isDestroyed = true;
    } catch (error) {
      this.isDestroyed = true;
      throw wrapError(error, 'middleware.destroy');
    }
  }

  /**
   * Checks if middleware manager is destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Throws error if middleware manager is destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone(
        'middleware',
        'Middleware manager has been destroyed'
      );
    }
  }
}

/**
 * Builder for creating responders with middleware chains
 */
export class ResponderBuilder<K> {
  private middlewares: MiddlewareFunction[] = [];
  private handlerFn: ((payload: any) => any | Promise<any>) | null = null;
  private isInstalled = false;

  constructor(
    private eventName: string,
    private bus: EventBus
  ) {}

  /**
   * Adds middleware to the responder chain
   * @param middleware Middleware function to add
   * @returns This builder for chaining
   */
  use(middleware: MiddlewareFunction): ResponderBuilder<K> {
    if (this.isInstalled) {
      throw BusErrorFactory.badRequest(
        'responder.use',
        'Cannot add middleware after handler is installed',
        { event: this.eventName }
      );
    }

    if (typeof middleware !== 'function') {
      throw BusErrorFactory.badRequest(
        'responder.use',
        'Middleware must be a function',
        { event: this.eventName, middleware: typeof middleware }
      );
    }

    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Sets the final handler function and installs the responder
   * @param handlerFn Handler function for processing requests
   */
  handler(handlerFn: (payload: any) => any | Promise<any>): void {
    if (this.isInstalled) {
      throw BusErrorFactory.badRequest(
        'responder.handler',
        'Handler already installed for this responder',
        { event: this.eventName }
      );
    }

    if (typeof handlerFn !== 'function') {
      throw BusErrorFactory.badRequest(
        'responder.handler',
        'Handler must be a function',
        { event: this.eventName, handler: typeof handlerFn }
      );
    }

    this.handlerFn = handlerFn;
    this.installResponder();
    this.isInstalled = true;
  }

  /**
   * Installs the responder with middleware chain on the bus
   * @private
   */
  private installResponder(): void {
    const composedHandler = async (payload: any) => {
      try {
        // Execute middleware chain
        const processedPayload = await this.executeMiddleware(payload);

        // Execute final handler
        if (this.handlerFn) {
          return await this.handlerFn(processedPayload);
        }

        throw BusErrorFactory.internal(
          'No handler function available',
          undefined,
          { event: this.eventName }
        );
      } catch (error) {
        // Re-throw BusErrors as-is, wrap others
        if (error instanceof BusError) {
          throw error;
        }
        throw wrapError(error, this.eventName);
      }
    };

    // Install the composed handler on the bus
    this.bus.on(this.eventName, composedHandler);
  }

  /**
   * Executes the middleware chain
   * @param payload Initial payload
   * @returns Processed payload after middleware
   * @private
   */
  private async executeMiddleware(payload: any): Promise<any> {
    if (this.middlewares.length === 0) {
      return payload;
    }

    let currentPayload = payload;
    let cancelled = false;
    let cancelReason: string | undefined;

    for (let i = 0; i < this.middlewares.length; i++) {
      const middleware = this.middlewares[i];
      let nextCalled = false;

      try {
        await new Promise<void>((resolve, reject) => {
          const next = () => {
            if (nextCalled) {
              reject(
                new BusError(
                  'next() called multiple times in middleware',
                  429,
                  { event: this.eventName, middlewareIndex: i }
                )
              );
              return;
            }
            nextCalled = true;
            resolve();
          };

          const cancel = (reason?: string) => {
            cancelled = true;
            cancelReason = reason;
            resolve(); // Resolve to exit the chain gracefully
          };

          // Execute middleware
          const result = middleware(currentPayload, next, cancel);

          // Handle async middleware
          if (result && typeof result.then === 'function') {
            result.catch(reject);
          }
        });

        // Check if middleware cancelled the chain
        if (cancelled) {
          throw BusErrorFactory.forbidden(
            this.eventName,
            cancelReason || 'Request cancelled by middleware',
            { middlewareIndex: i }
          );
        }

        // Check if next() was called
        if (!nextCalled) {
          throw BusErrorFactory.forbidden(
            this.eventName,
            'Middleware did not call next() or cancel()',
            { middlewareIndex: i }
          );
        }
      } catch (error) {
        throw wrapError(error, `${this.eventName}:middleware:${i}`);
      }
    }

    return currentPayload;
  }

  /**
   * Gets information about this responder
   * @returns Responder information
   */
  getInfo(): object {
    return {
      eventName: this.eventName,
      middlewareCount: this.middlewares.length,
      isInstalled: this.isInstalled,
      hasHandler: this.handlerFn !== null,
    };
  }
}

/**
 * Built-in middleware functions for common use cases
 */
export class BuiltinMiddleware {
  /**
   * Creates a logging middleware
   * @param options Logging options
   * @returns Middleware function
   */
  static logger(
    options: { logPayload?: boolean; prefix?: string } = {}
  ): MiddlewareFunction {
    const { logPayload = true, prefix = '[connectic]' } = options;

    return (
      payload: any,
      next: () => void
      //cancel: (reason?: string) => void
    ) => {
      const timestamp = new Date().toISOString();

      if (logPayload) {
        console.log(`${prefix} ${timestamp} Request:`, payload);
      } else {
        console.log(`${prefix} ${timestamp} Request received`);
      }

      next();
    };
  }

  /**
   * Creates a validation middleware using a validation function
   * @param validator Validation function
   * @returns Middleware function
   */
  static validator(
    validator: (payload: any) => boolean | string
  ): MiddlewareFunction {
    return (
      payload: any,
      next: () => void,
      cancel: (reason?: string) => void
    ) => {
      const result = validator(payload);

      if (result === true) {
        next();
      } else {
        const reason =
          typeof result === 'string' ? result : 'Validation failed';
        cancel(reason);
      }
    };
  }

  /**
   * Creates a rate limiting middleware
   * @param options Rate limiting options
   * @returns Middleware function
   */
  static rateLimit(options: {
    maxRequests: number;
    windowMs: number;
  }): MiddlewareFunction {
    const requests = new Map<string, number[]>();
    const { maxRequests, windowMs } = options;

    return (
      payload: any,
      next: () => void,
      cancel: (reason?: string) => void
    ) => {
      const key = payload?.key;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Clean old requests
      const userRequests = requests.get(key) || [];
      const validRequests = userRequests.filter(time => time > windowStart);

      if (validRequests.length >= maxRequests) {
        cancel(
          `Rate limit exceeded: ${maxRequests} requests per ${windowMs}ms`
        );
        return;
      }

      // Add current request
      validRequests.push(now);
      requests.set(key, validRequests);

      next();
    };
  }

  /**
   * Creates a timeout middleware
   * @param timeoutMs Timeout in milliseconds
   * @returns Middleware function
   */
  static timeout(timeoutMs: number): MiddlewareFunction {
    return async (
      _payload: any,
      next: () => void,
      cancel: (reason?: string) => void
    ) => {
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new BusError(`Middleware timeout after ${timeoutMs}ms`, 408));
        }, timeoutMs);
      });

      const nextPromise = new Promise<void>(resolve => {
        next();
        resolve();
      });

      try {
        await Promise.race([nextPromise, timeoutPromise]);
      } catch (error) {
        if (error instanceof BusError && error.busCode === 408) {
          cancel('Middleware execution timeout');
        } else {
          throw error;
        }
      }
    };
  }
}
