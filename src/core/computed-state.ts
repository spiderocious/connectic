/**
 * connectic - Computed State Management
 *
 * This file implements computed/derived state that automatically recalculates
 * when dependencies change, similar to Vue's computed properties or MobX reactions.
 */

import { BusErrorFactory, wrapError } from '../errors';
import { ComputedState } from '../types';
import { SharedStateImpl, SharedStateManager } from './shared-state';
import { deepClone, estimateObjectSize, safeExecute } from './utils';

/**
 * Manages computed state instances for a bus
 */
export class ComputedStateManager {
  private computedStates = new Set<ComputedStateImpl<any>>();
  private isDestroyed = false;

  constructor(private stateManager: SharedStateManager) {}

  /**
   * Creates a new computed state instance
   * @param computeFn Function that computes the derived value
   * @returns ComputedState instance
   */
  createComputed<T>(computeFn: () => T): ComputedState<T> {
    this.throwIfDestroyed();

    try {
      if (typeof computeFn !== 'function') {
        throw BusErrorFactory.badRequest(
          'createComputed',
          'Compute function must be a function',
          { computeFn: typeof computeFn }
        );
      }

      const computed = new ComputedStateImpl(
        computeFn,
        this.stateManager,
        this
      );
      this.computedStates.add(computed);

      return computed;
    } catch (error) {
      throw wrapError(error, 'createComputed');
    }
  }

  /**
   * Gets statistics about computed state usage
   * @returns Computed state manager statistics
   */
  getStats(): object {
    let totalSubscribers = 0;
    let totalDependencies = 0;
    let totalMemoryUsage = 0;
    let activeComputations = 0;

    this.computedStates.forEach(computed => {
      const stats = (computed as any).getStats();
      totalSubscribers += stats.subscriberCount;
      totalDependencies += stats.dependencyCount;
      totalMemoryUsage += stats.memoryUsage;
      if (!stats.isDestroyed) {
        activeComputations++;
      }
    });

    return {
      totalComputedStates: this.computedStates.size,
      activeComputations,
      totalSubscribers,
      totalDependencies,
      totalMemoryUsage,
      averageDependenciesPerComputed:
        this.computedStates.size > 0
          ? totalDependencies / this.computedStates.size
          : 0,
      isDestroyed: this.isDestroyed,
    };
  }

  /**
   * Destroys the computed state manager and all computed states
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      // Destroy all computed states
      this.computedStates.forEach(computed => {
        try {
          computed.destroy();
        } catch (error) {
          console.warn('Error destroying computed state:', error);
        }
      });

      this.computedStates.clear();
      this.isDestroyed = true;
    } catch (error) {
      this.isDestroyed = true;
      throw wrapError(error, 'computedStateManager.destroy');
    }
  }

  /**
   * Internal method to handle computed state destruction
   * @param computed Computed state that was destroyed
   * @internal
   */
  _handleComputedDestroyed(computed: ComputedStateImpl<any>): void {
    this.computedStates.delete(computed);
  }

  /**
   * Checks if computed state manager is destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Throws error if computed state manager is destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone(
        'computedStateManager',
        'Computed state manager has been destroyed'
      );
    }
  }
}

/**
 * Implementation of computed/derived state with automatic dependency tracking
 */
export class ComputedStateImpl<T> implements ComputedState<T> {
  private cachedValue: T | undefined;
  private isStale = true;
  private isComputing = false;
  private dependencies = new Set<SharedStateImpl<any>>();
  private dependencyUnsubscribers = new Map<SharedStateImpl<any>, () => void>();
  private subscribers = new Set<(value: T) => void>();
  private isDestroyed = false;
  private computationCount = 0;
  private lastComputeTime = 0;

  constructor(
    private computeFn: () => T,
    private stateManager: SharedStateManager,
    private manager: ComputedStateManager
  ) {
    // Initial computation to establish dependencies
    this.get();
  }

  /**
   * Gets the current computed value, recalculating if stale
   * @returns Current computed value
   */
  get(): T {
    this.throwIfDestroyed();

    if (!this.isStale && this.cachedValue !== undefined) {
      return this.cloneValue(this.cachedValue);
    }

    return this.recompute();
  }

  /**
   * Subscribes to computed value changes
   * @param callback Function to call when computed value changes
   * @returns Unsubscribe function
   */
  subscribe(callback: (value: T) => void): () => void {
    this.throwIfDestroyed();

    try {
      if (typeof callback !== 'function') {
        throw BusErrorFactory.badRequest(
          'subscribe',
          'Callback must be a function',
          { callback: typeof callback }
        );
      }

      this.subscribers.add(callback);

      // Return unsubscribe function
      return () => {
        this.subscribers.delete(callback);
      };
    } catch (error) {
      throw wrapError(error, 'computedState.subscribe');
    }
  }

  /**
   * Forces recomputation of the value
   * @returns Newly computed value
   */
  refresh(): T {
    this.throwIfDestroyed();
    this.invalidate();
    return this.get();
  }

  /**
   * Gets statistics about this computed state
   * @returns Computed state statistics
   */
  getStats(): object {
    return {
      subscriberCount: this.subscribers.size,
      dependencyCount: this.dependencies.size,
      isStale: this.isStale,
      isComputing: this.isComputing,
      computationCount: this.computationCount,
      lastComputeTime: this.lastComputeTime,
      memoryUsage:
        estimateObjectSize(this.cachedValue) +
        estimateObjectSize(this.subscribers) +
        estimateObjectSize(this.dependencies),
      hasValue: this.cachedValue !== undefined,
      valueType: typeof this.cachedValue,
      isDestroyed: this.isDestroyed,
    };
  }

  /**
   * Destroys the computed state and cleans up resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      // Unsubscribe from all dependencies
      this.dependencyUnsubscribers.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Error unsubscribing from dependency:', error);
        }
      });

      this.dependencies.clear();
      this.dependencyUnsubscribers.clear();
      this.subscribers.clear();
      this.cachedValue = undefined;

      // Notify manager of destruction
      this.manager._handleComputedDestroyed(this);

      this.isDestroyed = true;
    } catch (error) {
      this.isDestroyed = true;
      throw wrapError(error, 'computedState.destroy');
    }
  }

  /**
   * Checks if computed state is destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Recomputes the value and updates dependencies
   * @private
   */
  private recompute(): T {
    if (this.isComputing) {
      throw BusErrorFactory.internal(
        'Circular dependency detected in computed state',
        undefined,
        { computationCount: this.computationCount }
      );
    }

    try {
      this.isComputing = true;
      const startTime = Date.now();

      // Track dependencies during computation
      const newValue = this.trackDependencies();

      // Update cached value
      const oldValue = this.cachedValue;
      this.cachedValue = newValue;
      this.isStale = false;
      this.computationCount++;
      this.lastComputeTime = Date.now() - startTime;

      // Notify subscribers if value changed
      if (!this.valuesEqual(oldValue, newValue)) {
        this.notifySubscribers(newValue);
      }

      return this.cloneValue(newValue);
    } finally {
      this.isComputing = false;
    }
  }

  /**
   * Tracks state dependencies during computation
   * @private
   */
  private trackDependencies(): T {
    const oldDependencies = new Set(this.dependencies);
    const newDependencies = new Set<SharedStateImpl<any>>();

    // Set up dependency tracking
    const originalGetState = this.stateManager.getState.bind(this.stateManager);
    const originalGetStateValue = this.stateManager.getStateValue.bind(
      this.stateManager
    );

    // Override state access methods to track dependencies
    this.stateManager.getState = <U>(key: string) => {
      const state = originalGetState<U>(key);
      if (state && state instanceof SharedStateImpl) {
        newDependencies.add(state as any);
      }
      return state;
    };

    this.stateManager.getStateValue = <U>(key: string) => {
      const state = originalGetState<U>(key);
      if (state && state instanceof SharedStateImpl) {
        newDependencies.add(state as any);
      }
      return originalGetStateValue<U>(key);
    };

    try {
      // Execute computation with dependency tracking
      const result = this.computeFn();

      // Update dependencies
      this.updateDependencies(oldDependencies, newDependencies);

      return result;
    } finally {
      // Restore original methods
      this.stateManager.getState = originalGetState;
      this.stateManager.getStateValue = originalGetStateValue;
    }
  }

  /**
   * Updates dependency subscriptions
   * @private
   */
  private updateDependencies(
    oldDependencies: Set<SharedStateImpl<any>>,
    newDependencies: Set<SharedStateImpl<any>>
  ): void {
    // Unsubscribe from removed dependencies
    oldDependencies.forEach(dep => {
      if (!newDependencies.has(dep)) {
        const unsubscribe = this.dependencyUnsubscribers.get(dep);
        if (unsubscribe) {
          unsubscribe();
          this.dependencyUnsubscribers.delete(dep);
        }
        this.dependencies.delete(dep);
      }
    });

    // Subscribe to new dependencies
    newDependencies.forEach(dep => {
      if (!oldDependencies.has(dep)) {
        const unsubscribe = dep.subscribe(() => {
          this.invalidate();
        });
        this.dependencyUnsubscribers.set(dep, unsubscribe);
        this.dependencies.add(dep);
      }
    });
  }

  /**
   * Marks the computed value as stale and triggers recomputation
   * @private
   */
  private invalidate(): void {
    if (this.isStale) {
      return; // Already stale
    }

    this.isStale = true;

    // Recompute immediately if there are subscribers
    if (this.subscribers.size > 0) {
      // Use setTimeout to avoid synchronous recomputation chains
      setTimeout(() => {
        if (!this.isDestroyed && this.isStale) {
          this.recompute();
        }
      }, 0);
    }
  }

  /**
   * Notifies all subscribers of a value change
   * @private
   */
  private notifySubscribers(value: T): void {
    const clonedValue = this.cloneValue(value);

    this.subscribers.forEach(callback => {
      safeExecute(() => callback(clonedValue), 'computed state subscriber');
    });
  }

  /**
   * Creates a deep clone of a value to prevent mutation issues
   * @private
   */
  private cloneValue(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object') {
      return deepClone(value);
    }

    return value;
  }

  /**
   * Compares two values for equality
   * @private
   */
  private valuesEqual(a: T | undefined, b: T): boolean {
    if (a === undefined) {
      return false;
    }

    if (a === b) {
      return true;
    }

    if (
      typeof a === 'object' &&
      typeof b === 'object' &&
      a !== null &&
      b !== null
    ) {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        // Fallback to reference equality for non-serializable objects
        return a === b;
      }
    }

    return false;
  }

  /**
   * Throws error if computed state is destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone(
        'computedState',
        'Computed state has been destroyed'
      );
    }
  }
}

/**
 * Utility functions for working with computed state
 */
export class ComputedStateUtils {
  /**
   * Creates a memoized computed state that only recalculates when dependencies actually change
   * @param manager Computed state manager
   * @param computeFn Computation function
   * @param equalityFn Custom equality function for optimization
   * @returns Memoized computed state
   */
  static createMemoized<T>(
    manager: ComputedStateManager,
    computeFn: () => T,
    equalityFn?: (a: T, b: T) => boolean
  ): ComputedState<T> {
    let lastResult: T | undefined;
    let hasResult = false;

    const memoizedComputeFn = (): T => {
      const newResult = computeFn();

      if (hasResult && equalityFn) {
        if (equalityFn(lastResult!, newResult)) {
          return lastResult!;
        }
      }

      lastResult = newResult;
      hasResult = true;
      return newResult;
    };

    return manager.createComputed(memoizedComputeFn);
  }

  /**
   * Creates a computed state that combines multiple computed states
   * @param manager Computed state manager
   * @param computedStates Array of computed states to combine
   * @param combiner Function to combine the values
   * @returns Combined computed state
   */
  static combine<T extends any[], R>(
    manager: ComputedStateManager,
    computedStates: { [K in keyof T]: ComputedState<T[K]> },
    combiner: (...values: T) => R
  ): ComputedState<R> {
    return manager.createComputed(() => {
      const values = computedStates.map(computed => computed.get()) as T;
      return combiner(...values);
    });
  }

  /**
   * Creates a computed state that filters an array based on a predicate
   * @param manager Computed state manager
   * @param arrayComputed Computed state containing an array
   * @param predicate Filter predicate function
   * @returns Filtered computed state
   */
  static filter<T>(
    manager: ComputedStateManager,
    arrayComputed: ComputedState<T[]>,
    predicate: (item: T, index: number) => boolean
  ): ComputedState<T[]> {
    return manager.createComputed(() => {
      const array = arrayComputed.get();
      return Array.isArray(array) ? array.filter(predicate) : [];
    });
  }

  /**
   * Creates a computed state that maps an array to a new form
   * @param manager Computed state manager
   * @param arrayComputed Computed state containing an array
   * @param mapper Mapping function
   * @returns Mapped computed state
   */
  static map<T, R>(
    manager: ComputedStateManager,
    arrayComputed: ComputedState<T[]>,
    mapper: (item: T, index: number) => R
  ): ComputedState<R[]> {
    return manager.createComputed(() => {
      const array = arrayComputed.get();
      return Array.isArray(array) ? array.map(mapper) : [];
    });
  }

  /**
   * Creates a computed state that reduces an array to a single value
   * @param manager Computed state manager
   * @param arrayComputed Computed state containing an array
   * @param reducer Reducer function
   * @param initialValue Initial value for reduction
   * @returns Reduced computed state
   */
  static reduce<T, R>(
    manager: ComputedStateManager,
    arrayComputed: ComputedState<T[]>,
    reducer: (accumulator: R, current: T, index: number) => R,
    initialValue: R
  ): ComputedState<R> {
    return manager.createComputed(() => {
      const array = arrayComputed.get();
      return Array.isArray(array)
        ? array.reduce(reducer, initialValue)
        : initialValue;
    });
  }

  /**
   * Creates a computed state with async computation (returns Promise)
   * @param manager Computed state manager
   * @param asyncComputeFn Async computation function
   * @param initialValue Initial value while async computation is pending
   * @returns Computed state that handles async values
   */
  static createAsync<T>(
    manager: ComputedStateManager,
    stateManager: import('./shared-state').SharedStateManager,
    asyncComputeFn: () => Promise<T>,
    initialValue: T
  ): ComputedState<{ value: T; loading: boolean; error: Error | null }> {
    // Create internal state to trigger recomputation
    const asyncStateKey = `async_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const asyncState = stateManager.createState(asyncStateKey, {
      value: initialValue,
      loading: false,
      error: null as Error | null,
      version: 0,
    });

    let currentPromise: Promise<T> | null = null;

    return manager.createComputed(() => {
      // Get current async state to create dependency
      const currentAsyncState = asyncState.get();

      // Start async computation if not already running
      const promise = asyncComputeFn();

      if (promise !== currentPromise) {
        currentPromise = promise;

        // Update to loading state
        asyncState.set({
          value: currentAsyncState.value,
          loading: true,
          error: null,
          version: currentAsyncState.version + 1,
        });

        // Handle async result
        promise
          .then(value => {
            if (promise === currentPromise) {
              asyncState.set({
                value,
                loading: false,
                error: null,
                version: currentAsyncState.version + 1,
              });
            }
          })
          .catch(error => {
            if (promise === currentPromise) {
              asyncState.set({
                value: currentAsyncState.value,
                loading: false,
                error:
                  error instanceof Error ? error : new Error(String(error)),
                version: currentAsyncState.version + 1,
              });
            }
          });
      }

      // Return current async state
      return {
        value: currentAsyncState.value,
        loading: currentAsyncState.loading,
        error: currentAsyncState.error,
      };
    });
  }

  /**
   * Creates a computed state that debounces rapid changes
   * @param manager Computed state manager
   * @param sourceComputed Source computed state
   * @param delayMs Debounce delay in milliseconds
   * @returns Debounced computed state
   */
  static debounce<T>(
    manager: ComputedStateManager,
    sourceComputed: ComputedState<T>,
    delayMs: number
  ): ComputedState<T> {
    let timeoutId: NodeJS.Timeout | null = null;
    let lastValue: T = sourceComputed.get();
    let debouncedValue: T = lastValue;

    // Create computed that returns debounced value
    const computed = manager.createComputed(() => debouncedValue);

    // Subscribe to source changes with debouncing
    sourceComputed.subscribe(newValue => {
      lastValue = newValue;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        debouncedValue = lastValue;
        // Force recomputation of debounced computed
        // Needs touch : Note: This would need additional mechanism
        timeoutId = null;
      }, delayMs);
    });

    return computed;
  }

  /**
   * Creates a computed state that only updates when value passes validation
   * @param manager Computed state manager
   * @param sourceComputed Source computed state
   * @param validator Validation function
   * @param fallbackValue Value to use when validation fails
   * @returns Validated computed state
   */
  static validate<T>(
    manager: ComputedStateManager,
    sourceComputed: ComputedState<T>,
    validator: (value: T) => boolean,
    fallbackValue: T
  ): ComputedState<T> {
    return manager.createComputed(() => {
      const value = sourceComputed.get();
      return validator(value) ? value : fallbackValue;
    });
  }

  /**
   * Creates a computed state that caches expensive computations
   * @param manager Computed state manager
   * @param computeFn Expensive computation function
   * @param cacheKey Function to generate cache key from dependencies
   * @param maxCacheSize Maximum number of cached results
   * @returns Cached computed state
   */
  static cached<T>(
    manager: ComputedStateManager,
    computeFn: () => T,
    cacheKey: () => string,
    maxCacheSize: number = 100
  ): ComputedState<T> {
    const cache = new Map<string, T>();
    const keyOrder: string[] = [];

    return manager.createComputed(() => {
      const key = cacheKey();

      // Check cache first
      if (cache.has(key)) {
        return cache.get(key)!;
      }

      // Compute new value
      const value = computeFn();

      // Add to cache
      cache.set(key, value);
      keyOrder.push(key);

      // Evict oldest if cache is full
      if (cache.size > maxCacheSize) {
        const oldestKey = keyOrder.shift()!;
        cache.delete(oldestKey);
      }

      return value;
    });
  }
}
