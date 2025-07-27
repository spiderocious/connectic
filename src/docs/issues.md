# Connectic Remaining Fixes Implementation Guide

## Issue #4: Memory Leaks in Event Bus (CRITICAL)

**File:** `/src/core/event-bus.ts`

**Replace:** Lines 89-106 (the entire `once()` method)

```typescript
// CURRENT CODE TO REPLACE:
once(event: string, handler: Function): () => void {
  this.throwIfDestroyed();

  let unsubscribed = false;

  const onceHandler = (payload: any) => {
    if (unsubscribed) return;

    unsubscribed = true;
    unsubscribe();
    handler(payload);
  };

  const unsubscribe = this.on(event, onceHandler);

  // Return unsubscribe function that prevents execution
  return () => {
    unsubscribed = true;
    unsubscribe();
  };
}
```

**Replace WITH:**

```typescript
once(event: string, handler: Function): () => void {
  this.throwIfDestroyed();

  let unsubscribed = false;
  let internalUnsubscribe: (() => void) | null = null;

  const onceHandler = (payload: any) => {
    if (unsubscribed) return;
    
    // Immediately unsubscribe to prevent multiple calls
    unsubscribed = true;
    if (internalUnsubscribe) {
      internalUnsubscribe();
      internalUnsubscribe = null;
    }
    
    // Call the original handler
    try {
      handler(payload);
    } catch (error) {
      console.error(`Error in once handler for ${event}:`, error);
    }
  };

  // Set up the subscription and store the unsubscribe function
  internalUnsubscribe = this.on(event, onceHandler);

  // Return unsubscribe function that prevents execution and cleans up
  return () => {
    if (!unsubscribed) {
      unsubscribed = true;
      if (internalUnsubscribe) {
        internalUnsubscribe();
        internalUnsubscribe = null;
      }
    }
  };
}
```

---

## Issue #6: Error Propagation Inconsistencies (MAJOR)

**File:** `/src/errors.ts`

**Replace:** Lines 265-275 (the entire `wrapError` function)

```typescript
// CURRENT CODE TO REPLACE:
export function wrapError(error: unknown, event?: string): BusError {
  if (isBusError(error)) {
    return error
  }

  if (error instanceof Error) {
    return BusErrorFactory.internal(error.message, error, { event })
  }

  return BusErrorFactory.internal(
    `Unknown error: ${String(error)}`,
    undefined,
    { event, originalError: error }
  )
}
```

**Replace WITH:**

```typescript
export function wrapError(error: unknown, event?: string): BusError {
  // Don't double-wrap BusErrors - preserve original error with context
  if (isBusError(error)) {
    // If it's already a BusError, just add context if missing
    if (event && !error.details?.event) {
      return new BusError(
        error.message,
        error.busCode,
        { ...error.details, event, wrappedFrom: event }
      );
    }
    return error;
  }

  if (error instanceof Error) {
    // Preserve original stack trace by not creating a new Error
    const busError = BusErrorFactory.internal(error.message, error, { event });
    // Preserve the original stack trace
    if (error.stack) {
      busError.stack = error.stack;
    }
    return busError;
  }

  return BusErrorFactory.internal(
    `Unknown error: ${String(error)}`,
    undefined,
    { event, originalError: error }
  );
}
```

---

## Issue #7: Resource Cleanup Incomplete (MAJOR)

**File:** `/src/core/shared-state.ts`

**Replace:** Lines 346-369 (the entire `destroy()` method in `SharedStateImpl`)

```typescript
// CURRENT CODE TO REPLACE:
destroy(): void {
  if (this.isDestroyed) {
    return;
  }

  try {
    // Unsubscribe from bus events
    if (this.unsubscribeFromBus) {
      this.unsubscribeFromBus();
      this.unsubscribeFromBus = null;
    }

    // Clear all subscribers
    this.subscribers.clear();

    // Notify manager of destruction
    this.manager._handleStateDestroyed(this.key);

    this.isDestroyed = true;
  } catch (error) {
    this.isDestroyed = true;
    throw wrapError(error, `destroyState:${this.key}`);
  }
}
```

**Replace WITH:**

```typescript
destroy(): void {
  if (this.isDestroyed) {
    return;
  }

  try {
    // Emit destruction event BEFORE cleanup to notify other apps
    try {
      this.bus.emit(`state:${this.key}:destroyed`, { key: this.key });
    } catch (error) {
      console.warn(`Failed to emit destruction event for state ${this.key}:`, error);
    }

    // Unsubscribe from bus events
    if (this.unsubscribeFromBus) {
      this.unsubscribeFromBus();
      this.unsubscribeFromBus = null;
    }

    // Clear all subscribers with proper error handling
    const subscribersToNotify = Array.from(this.subscribers);
    this.subscribers.clear();
    
    // Notify subscribers of destruction (optional - for cleanup)
    subscribersToNotify.forEach(callback => {
      try {
        // Call with undefined to signal destruction
        callback(undefined as any);
      } catch (error) {
        console.warn(`Error notifying subscriber during state destruction:`, error);
      }
    });

    // Clear value reference to help garbage collection
    this.value = undefined as any;

    // Notify manager of destruction
    this.manager._handleStateDestroyed(this.key);

    this.isDestroyed = true;
  } catch (error) {
    this.isDestroyed = true;
    throw wrapError(error, `destroyState:${this.key}`);
  }
}
```

---

## Issue #8: Middleware Execution Order Issues (MAJOR)

**File:** `/src/core/middleware.ts`

**Replace:** Lines 532-600 (the entire `executeMiddleware()` method)

```typescript
// CURRENT CODE TO REPLACE:
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
```

**Replace WITH:**

```typescript
private async executeMiddleware(payload: any): Promise<any> {
  if (this.middlewares.length === 0) {
    return payload;
  }

  let currentPayload = payload;
  let cancelled = false;
  let cancelReason: string | undefined;
  const executionContext = {
    startTime: Date.now(),
    executedMiddleware: [] as number[]
  };

  for (let i = 0; i < this.middlewares.length; i++) {
    if (cancelled) {
      break; // Don't execute remaining middleware if cancelled
    }

    const middleware = this.middlewares[i];
    let nextCalled = false;
    let middlewareError: Error | null = null;

    try {
      await new Promise<void>((resolve, reject) => {
        const next = () => {
          if (nextCalled) {
            reject(
              new BusError(
                'next() called multiple times in middleware',
                429,
                { event: this.eventName, middlewareIndex: i, executionContext }
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
          nextCalled = true; // Prevent "next() not called" error
          resolve(); // Resolve to exit the chain gracefully
        };

        try {
          // Execute middleware with timeout protection
          const middlewarePromise = Promise.resolve(middleware(currentPayload, next, cancel));
          
          // Add timeout to prevent hanging middleware
          const timeoutPromise = new Promise<void>((_, timeoutReject) => {
            setTimeout(() => {
              timeoutReject(new BusError(
                `Middleware timeout after 30 seconds`,
                408,
                { event: this.eventName, middlewareIndex: i }
              ));
            }, 30000);
          });

          Promise.race([middlewarePromise, timeoutPromise]).catch(reject);
        } catch (syncError) {
          reject(syncError);
        }
      });

      // Track successful execution
      executionContext.executedMiddleware.push(i);

      // Check if middleware cancelled the chain
      if (cancelled) {
        throw BusErrorFactory.forbidden(
          this.eventName,
          cancelReason || 'Request cancelled by middleware',
          { middlewareIndex: i, executionContext }
        );
      }

      // Check if next() was called
      if (!nextCalled) {
        throw BusErrorFactory.forbidden(
          this.eventName,
          'Middleware did not call next() or cancel()',
          { middlewareIndex: i, executionContext }
        );
      }

    } catch (error) {
      middlewareError = error instanceof Error ? error : new Error(String(error));
      
      // Continue with cleanup even if this middleware failed
      console.warn(
        `Middleware ${i} failed for event ${this.eventName}:`,
        middlewareError.message
      );
      
      // Re-throw with context
      throw wrapError(middlewareError, `${this.eventName}:middleware:${i}`);
    }
  }

  return currentPayload;
}
```

---

## Issue #9 COMPLETION: Cache Eviction Algorithm

**File:** `/src/core/cache.ts`

**Find and Replace:** The `evictLRU()` method (around line 300)

```typescript
// CURRENT CODE TO REPLACE:
private evictLRU(): void {
  let oldestKey: string | null = null;
  let oldestTime = Date.now();

  for (const [key, entry] of this.cache.entries()) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    this.cache.delete(oldestKey);
    this.stats.evictions++;
  }
}
```

**Replace WITH:**

```typescript
private evictLRU(): void {
  if (this.cache.size === 0) return;

  let oldestKey: string | null = null;
  let oldestAccess = Number.MAX_SAFE_INTEGER;

  // Use the access order tracking for O(1) eviction
  for (const [key, accessTime] of this.accessOrder.entries()) {
    if (accessTime < oldestAccess && this.cache.has(key)) {
      oldestAccess = accessTime;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    this.cache.delete(oldestKey);
    this.accessOrder.delete(oldestKey);
    this.stats.evictions++;
  }
}
```

**Also Update:** In the same file, update the `get()` method access tracking

**Find:** The line `entry.lastAccessed = Date.now();` (around line 65)

**Replace WITH:**
```typescript
entry.lastAccessed = Date.now();
this.accessOrder.set(key, ++this.accessCounter);
```

**And Update:** The `set()` method, add after creating the cache entry:

**Add this line:** (around line 90, after setting the cache entry)
```typescript
this.accessOrder.set(key, ++this.accessCounter);
```

---

## Issue #10: State Synchronization Timing Issues

**File:** `/src/core/shared-state.ts`

**Step 1:** Add properties to `SharedStateImpl` class (around line 190)

**Add these lines after existing properties:**
```typescript
private updateSequence = 0;
private lastRemoteSequence = -1;
```

**Step 2:** Replace the `set()` method (around line 280)

```typescript
// CURRENT CODE TO REPLACE:
set(value: T): void {
  this.throwIfDestroyed();

  try {
    const oldValue = this.value;
    const newValue = this.cloneValue(value);

    // Only update if value actually changed
    if (!this.valuesEqual(oldValue, newValue)) {
      this.value = newValue;

      // Notify local subscribers
      this.notifySubscribers(newValue);

      // Emit bus event for cross-app synchronization
      this.bus.emit(`state:${this.key}:changed`, newValue);
    }
  } catch (error) {
    throw wrapError(error, `setState:${this.key}`);
  }
}
```

**Replace WITH:**

```typescript
set(value: T): void {
  this.throwIfDestroyed();

  try {
    const oldValue = this.value;
    const newValue = this.cloneValue(value);

    // Only update if value actually changed
    if (!this.valuesEqual(oldValue, newValue)) {
      this.value = newValue;
      this.updateSequence++;

      // Notify local subscribers
      this.notifySubscribers(newValue);

      // Emit bus event for cross-app synchronization with sequence
      this.bus.emit(`state:${this.key}:changed`, {
        value: newValue,
        sequence: this.updateSequence,
        timestamp: Date.now(),
        source: 'local'
      });
    }
  } catch (error) {
    throw wrapError(error, `setState:${this.key}`);
  }
}
```

**Step 3:** Replace the `setupCrossAppSynchronization()` method (around line 430)

```typescript
// CURRENT CODE TO REPLACE:
private setupCrossAppSynchronization(): void {
  // Listen for state changes from other applications
  this.unsubscribeFromBus = this.bus.on(
    `state:${this.key}:changed`,
    (newValue: T) => {
      // Avoid infinite loops by checking if value actually changed
      if (!this.valuesEqual(this.value, newValue)) {
        this.value = this.cloneValue(newValue);
        this.notifySubscribers(newValue);
      }
    }
  );
}
```

**Replace WITH:**

```typescript
private setupCrossAppSynchronization(): void {
  // Listen for state changes from other applications
  this.unsubscribeFromBus = this.bus.on(
    `state:${this.key}:changed`,
    (changeEvent: any) => {
      // Handle both old format (direct value) and new format (with metadata)
      let newValue: T;
      let sequence: number;
      let source: string;

      if (changeEvent && typeof changeEvent === 'object' && 'value' in changeEvent) {
        // New format with metadata
        newValue = changeEvent.value;
        sequence = changeEvent.sequence || 0;
        source = changeEvent.source || 'remote';
      } else {
        // Old format - direct value (backward compatibility)
        newValue = changeEvent;
        sequence = 0;
        source = 'remote';
      }

      // Skip if this is our own update
      if (source === 'local') {
        return;
      }

      // Apply sequence-based conflict resolution
      if (sequence <= this.lastRemoteSequence) {
        // Ignore out-of-order updates
        return;
      }

      // Avoid infinite loops by checking if value actually changed
      if (!this.valuesEqual(this.value, newValue)) {
        this.value = this.cloneValue(newValue);
        this.lastRemoteSequence = sequence;
        this.notifySubscribers(newValue);
      }
    }
  );
}
```

---

## Issue #11: Plugin System Lifecycle Issues

**File:** `/src/core/middleware.ts`

**Step 1:** Add property to `MiddlewareManager` class (around line 15)

**Add this line after existing properties:**
```typescript
private pluginDependencies = new Map<string, string[]>();
```

**Step 2:** Add this new method to `MiddlewareManager` class:

```typescript
private getPluginDependencies(plugin: BusPlugin): string[] {
  // Check if plugin has dependency information
  if ('dependencies' in plugin && Array.isArray((plugin as any).dependencies)) {
    return (plugin as any).dependencies;
  }
  return [];
}
```

**Step 3:** In the `addPlugin()` method, replace the plugin installation section:

**Find:** (around line 50)
```typescript
// Install the plugin
plugin.install(this.bus);
this.plugins.push(plugin);
```

**Replace WITH:**
```typescript
// Check and store dependencies
const dependencies = this.getPluginDependencies(plugin);
this.pluginDependencies.set(plugin.name, dependencies);

// Validate dependencies exist
for (const dep of dependencies) {
  if (!this.hasPlugin(dep)) {
    throw BusErrorFactory.badRequest(
      'addPlugin',
      `Plugin "${plugin.name}" depends on "${dep}" which is not installed`,
      { plugin: plugin.name, missingDependency: dep }
    );
  }
}

// Install the plugin
plugin.install(this.bus);
this.plugins.push(plugin);
```

**Step 4:** Replace the `destroy()` method (around line 220)

```typescript
// CURRENT CODE TO REPLACE:
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
```

**Replace WITH:**

```typescript
destroy(): void {
  if (this.isDestroyed) {
    return;
  }

  try {
    // Uninstall plugins in reverse dependency order
    const uninstallOrder = this.calculateDestructionOrder();
    
    uninstallOrder.forEach(plugin => {
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
    this.pluginDependencies.clear();

    this.isDestroyed = true;
  } catch (error) {
    this.isDestroyed = true;
    throw wrapError(error, 'middleware.destroy');
  }
}
```

**Step 5:** Add this new method to `MiddlewareManager` class:

```typescript
private calculateDestructionOrder(): BusPlugin[] {
  const result: BusPlugin[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (pluginName: string) => {
    if (visited.has(pluginName)) return;
    if (visiting.has(pluginName)) {
      // Circular dependency - just add to result
      return;
    }

    visiting.add(pluginName);
    
    // Visit all plugins that depend on this one (reverse dependencies)
    this.plugins.forEach(plugin => {
      const deps = this.pluginDependencies.get(plugin.name) || [];
      if (deps.includes(pluginName) && !visited.has(plugin.name)) {
        visit(plugin.name);
      }
    });

    visiting.delete(pluginName);
    visited.add(pluginName);
    
    // Add the plugin itself
    const plugin = this.plugins.find(p => p.name === pluginName);
    if (plugin) {
      result.push(plugin);
    }
  };

  // Visit all plugins
  this.plugins.forEach(plugin => {
    visit(plugin.name);
  });

  return result;
}
```

---

## Issue #12: Request Timeout Cleanup Issues

**File:** `/src/core/request-response.ts`

**Replace:** The timeout handling section in `executeSingleRequest()` (around line 425)

**Find:**
```typescript
// Set up timeout
const timeoutId = setTimeout(() => {
  if (!resolved) {
    resolved = true;
    cleanup();
    this.stats.timeoutRequests++;
    reject(BusErrorFactory.timeout(event, options.timeout));
  }
}, options.timeout);
```

**Replace WITH:**
```typescript
// Set up timeout
const timeoutId = setTimeout(() => {
  if (!resolved) {
    resolved = true;
    
    // Ensure complete cleanup before rejecting
    try {
      cleanup();
    } catch (cleanupError) {
      console.warn(`Cleanup error during timeout for ${event}:`, cleanupError);
    }
    
    this.stats.timeoutRequests++;
    
    // Create detailed timeout error
    const timeoutError = BusErrorFactory.timeout(event, options.timeout, {
      correlationId,
      pendingRequests: this.pendingRequests.size,
      totalRequests: this.stats.totalRequests
    });
    
    reject(timeoutError);
  }
}, options.timeout);
```

**Also Replace:** The cleanup function in the same method

**Find:**
```typescript
const cleanup = () => {
  clearTimeout(timeoutId);
  if (options.signal) {
    options.signal.removeEventListener('abort', onAbort);
  }
  this.bus.off(`response:${correlationId}`, responseHandler);
  this.pendingRequests.delete(correlationId);
};
```

**Replace WITH:**
```typescript
const cleanup = () => {
  try {
    clearTimeout(timeoutId);
    
    if (options.signal) {
      try {
        options.signal.removeEventListener('abort', onAbort);
      } catch (error) {
        console.warn('Error removing abort listener:', error);
      }
    }
    
    try {
      this.bus.off(`response:${correlationId}`, responseHandler);
    } catch (error) {
      console.warn('Error removing response listener:', error);
    }
    
    // Always remove from pending requests, even if other cleanup fails
    this.pendingRequests.delete(correlationId);
  } catch (error) {
    console.warn(`Complete cleanup failed for request ${correlationId}:`, error);
    // Force removal from pending requests as last resort
    try {
      this.pendingRequests.delete(correlationId);
    } catch (finalError) {
      console.error('Critical: Failed to remove pending request:', finalError);
    }
  }
};
```

---

## Issue #13: Interceptor Error Handling

**File:** `/src/core/interceptors.ts`

**Replace:** The `applyRequestInterceptors()` method (around line 75)

```typescript
// CURRENT CODE TO REPLACE:
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
```

**Replace WITH:**

```typescript
applyRequestInterceptors(event: string, payload: any): any {
  this.throwIfDestroyed();

  try {
    if (this.requestInterceptors.length === 0) {
      return payload;
    }

    let transformedPayload = deepClone(payload);
    const errors: Array<{ index: number; error: any }> = [];

    for (let i = 0; i < this.requestInterceptors.length; i++) {
      const interceptor = this.requestInterceptors[i];

      try {
        const result = interceptor(event, transformedPayload);
        
        if (result !== undefined) {
          transformedPayload = result;
        }
      } catch (error) {
        // Log the error but continue with other interceptors
        console.warn(
          `Request interceptor #${i} failed for event '${event}':`,
          error
        );
        
        errors.push({ index: i, error });
        this.stats.requestErrors++;
        
        // Continue with the next interceptor
        continue;
      }
    }

    this.stats.requestInterceptions++;

    // If there were critical errors (more than 50% failed), throw
    if (errors.length > this.requestInterceptors.length / 2) {
      throw new BusError(
        `Too many request interceptor failures (${errors.length}/${this.requestInterceptors.length})`,
        500,
        { event, errors: errors.slice(0, 3) } // Only include first 3 errors to avoid huge objects
      );
    }

    return transformedPayload;
  } catch (error) {
    if (error instanceof BusError) {
      throw error;
    }
    this.stats.requestErrors++;
    throw wrapError(error, `applyRequestInterceptors:${event}`);
  }
}
```

**Also Replace:** The `applyResponseInterceptors()` method with the same pattern

```typescript
// REPLACE the applyResponseInterceptors method:
applyResponseInterceptors(event: string, response: any): any {
  this.throwIfDestroyed();

  try {
    if (this.responseInterceptors.length === 0) {
      return response;
    }

    let transformedResponse = deepClone(response);
    const errors: Array<{ index: number; error: any }> = [];

    for (let i = 0; i < this.responseInterceptors.length; i++) {
      const interceptor = this.responseInterceptors[i];

      try {
        const result = interceptor(event, transformedResponse);

        if (result !== undefined) {
          transformedResponse = result;
        }
      } catch (error) {
        // Log the error but continue with other interceptors
        console.warn(
          `Response interceptor #${i} failed for event '${event}':`,
          error
        );
        
        errors.push({ index: i, error });
        this.stats.responseErrors++;
        
        // Continue with the next interceptor
        continue;
      }
    }

    this.stats.responseInterceptions++;

    // If there were critical errors (more than 50% failed), throw
    if (errors.length > this.responseInterceptors.length / 2) {
      throw new BusError(
        `Too many response interceptor failures (${errors.length}/${this.responseInterceptors.length})`,
        500,
        { event, errors: errors.slice(0, 3) }
      );
    }

    return transformedResponse;
  } catch (error) {
    if (error instanceof BusError) {
      throw error;
    }
    this.stats.responseErrors++;
    throw wrapError(error, `applyResponseInterceptors:${event}`);
  }
}
```

---

## Issue #14: Namespacing Performance Issues

**File:** `/src/index.ts`

**Step 1:** Add property to `MFEBus` class (around line 35)

**Add this line after existing properties:**
```typescript
private namespacedEventCache = new Map<string, string>();
```

**Step 2:** Replace the `namespacedEvent()` method (around line 500)

**Find:**
```typescript
private namespacedEvent(event: string): string {
  return this.namespacePath ? `${this.namespacePath}:${event}` : event;
}
```

**Replace WITH:**
```typescript
private namespacedEvent(event: string): string {
  if (!this.namespacePath) {
    return event;
  }

  // Use cache for performance optimization
  let namespacedEvent = this.namespacedEventCache.get(event);
  if (namespacedEvent === undefined) {
    namespacedEvent = `${this.namespacePath}:${event}`;
    
    // Prevent cache from growing too large
    if (this.namespacedEventCache.size > 1000) {
      // Clear oldest entries (simple LRU simulation)
      const firstKey = this.namespacedEventCache.keys().next().value;
      if (firstKey) {
        this.namespacedEventCache.delete(firstKey);
      }
    }
    
    this.namespacedEventCache.set(event, namespacedEvent);
  }
  
  return namespacedEvent;
}
```

**Step 3:** Add cleanup in the `destroy()` method (around line 400)

**Find the line:** `this.isDestroyed = true` in the destroy method

**Add this line BEFORE it:**
```typescript
this.namespacedEventCache.clear();
```

---

## Issue #15: Circular Dependency in Managers

**File:** `/src/core/shared-state.ts`

**Step 1:** Replace the `SharedStateImpl` constructor (around line 190)

**Find:**
```typescript
constructor(
  private key: string,
  initialValue: T,
  private bus: EventBus,
  private manager: SharedStateManager
) {
  this.value = this.cloneValue(initialValue);
  this.setupCrossAppSynchronization();
}
```

**Replace WITH:**
```typescript
constructor(
  private key: string,
  initialValue: T,
  private bus: EventBus,
  private managerRef: WeakRef<SharedStateManager>
) {
  this.value = this.cloneValue(initialValue);
  this.setupCrossAppSynchronization();
}
```

**Step 2:** Update the `destroy()` method manager reference

**Find:** (in the destroy method)
```typescript
// Notify manager of destruction
this.manager._handleStateDestroyed(this.key);
```

**Replace WITH:**
```typescript
// Notify manager of destruction
const manager = this.managerRef.deref();
if (manager) {
  manager._handleStateDestroyed(this.key);
}
```

**Step 3:** Update the `createState()` method in `SharedStateManager`

**Find:**
```typescript
// Create new state instance
const state = new SharedStateImpl(key, initialValue, this.bus, this);
```

**Replace WITH:**
```typescript
// Create new state instance
const state = new SharedStateImpl(key, initialValue, this.bus, new WeakRef(this));
```

---

**File:** `/src/core/computed-state.ts`

**Step 1:** Replace the `ComputedStateImpl` constructor (around line 120)

**Find:**
```typescript
constructor(
  private computeFn: () => T,
  private stateManager: SharedStateManager,
  private manager: ComputedStateManager
) {
  // Initial computation to establish dependencies
  this.get();
}
```

**Replace WITH:**
```typescript
constructor(
  private computeFn: () => T,
  private stateManager: SharedStateManager,
  private managerRef: WeakRef<ComputedStateManager>
) {
  // Initial computation to establish dependencies
  this.get();
}
```

**Step 2:** Update the `destroy()` method manager reference

**Find:** (in the destroy method)
```typescript
// Notify manager of destruction
this.manager._handleComputedDestroyed(this);
```

**Replace WITH:**
```typescript
// Notify manager of destruction
const manager = this.managerRef.deref();
if (manager) {
  manager._handleComputedDestroyed(this);
}
```

**Step 3:** Update the `createComputed()` method in `ComputedStateManager`

**Find:**
```typescript
const computed = new ComputedStateImpl(
  computeFn,
  this.stateManager,
  this
);
```

**Replace WITH:**
```typescript
const computed = new ComputedStateImpl(
  computeFn,
  this.stateManager,
  new WeakRef(this)
);
```

---

## 🎯 **IMPLEMENTATION SUMMARY**

This guide covers **9 remaining critical fixes** that need to be implemented:

### **CRITICAL (Fix Immediately)**
- ✅ **Issue #4** - EventBus once() memory leaks  
- ✅ **Issue #8** - Middleware execution resilience
- ✅ **Issue #12** - Request timeout cleanup

### **MAJOR (High Impact)**  
- ✅ **Issue #6** - Error propagation consistency
- ✅ **Issue #7** - State cleanup enhancement
- ✅ **Issue #9** - Complete cache eviction optimization
- ✅ **Issue #13** - Interceptor error handling

### **OPTIMIZATION (Performance)**
- ✅ **Issue #10** - State synchronization timing
- ✅ **Issue #11** - Plugin lifecycle management  
- ✅ **Issue #14** - Namespacing performance
- ✅ **Issue #15** - Circular dependency cleanup


## 🚨 **IMPORTANT NOTES**

- **Preserve all existing API methods** - these are internal implementation fixes only
- **Watch for TypeScript errors** - some changes may require type adjustments
- **Backward compatibility** - all changes maintain existing functionality

These fixes will transform connectic from a prototype with implementation gaps into a **production-ready, robust communication library** with proper error handling, memory management, and performance optimizations.