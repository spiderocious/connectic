/**
 * connectic - Shared State Management
 *
 * This file implements reactive shared state that automatically synchronizes
 * across components and applications using the event bus.
 */

import { BusErrorFactory, wrapError } from '../errors';
import { SharedState } from '../types';
import { EventBus } from './event-bus';
import {
  deepClone,
  estimateObjectSize,
  safeExecute,
  validateParameters,
} from './utils';

/**
 * Manages shared state instances for a bus
 */
export class SharedStateManager {
  private states = new Map<string, SharedStateImpl<any>>();
  private isDestroyed = false;
  private dependencyGraph = new Map<string, Set<string>>();
  private currentAccessStack = new Set<string>();

  constructor(private bus: EventBus) {}

  /**
   * Creates a new shared state instance
   * @param key Unique state identifier
   * @param initialValue Initial state value
   * @returns SharedState instance
   */
  createState<T>(key: string, initialValue: T): SharedState<T> {
    this.throwIfDestroyed();

    try {
      validateParameters(key);

      // Check if state already exists
      if (this.states.has(key)) {
        const existing = this.states.get(key)!;
        console.warn(
          `State "${key}" already exists. Returning existing instance.`
        );
        return existing as SharedState<T>;
      }

      // Create new state instance
      const state = new SharedStateImpl(key, initialValue, this.bus, new WeakRef(this));
      this.states.set(key, state);

      return state;
    } catch (error) {
      throw wrapError(error, `createState:${key}`);
    }
  }

  /**
   * Gets an existing shared state instance
   * @param key State identifier
   * @returns SharedState instance or undefined
   */
  getState<T>(key: string): SharedState<T> | undefined {
    this.throwIfDestroyed();

    try {
      validateParameters(key);
      return this.states.get(key) as SharedState<T> | undefined;
    } catch (error) {
      throw wrapError(error, `getState:${key}`);
    }
  }

  /**
   * Gets current value of a state without subscribing
   * @param key State identifier
   * @returns Current state value or undefined
   */
  getStateValue<T>(key: string): T | undefined {
    this.throwIfDestroyed();

    try {
      const state = this.getState<T>(key);
      return state?.get();
    } catch (error) {
      throw wrapError(error, `getStateValue:${key}`);
    }
  }

  /**
   * Sets state value directly (creates state if it doesn't exist)
   * @param key State identifier
   * @param value New state value
   */
  setState<T>(key: string, value: T): void {
    this.throwIfDestroyed();

    try {
      validateParameters(key);

      let state = this.getState<T>(key);
      if (!state) {
        // Create state if it doesn't exist
        state = this.createState(key, value);
      } else {
        state.set(value);
      }
    } catch (error) {
      throw wrapError(error, `setState:${key}`);
    }
  }

  /**
   * Removes a state instance
   * @param key State identifier
   * @returns True if state was removed
   */
  removeState(key: string): boolean {
    this.throwIfDestroyed();

    try {
      validateParameters(key);

      const state = this.states.get(key);
      if (!state) {
        return false;
      }

      // Destroy the state instance
      state.destroy();
      this.states.delete(key);

      // Emit removal event for cross-app synchronization
      this.bus.emit(`state:${key}:removed`, undefined);

      return true;
    } catch (error) {
      throw wrapError(error, `removeState:${key}`);
    }
  }

  /**
   * Gets all state keys
   * @returns Array of state keys
   */
  getStateKeys(): string[] {
    this.throwIfDestroyed();
    return Array.from(this.states.keys());
  }

  /**
   * Gets statistics about state usage
   * @returns State manager statistics
   */
  getStats(): object {
    const totalStates = this.states.size;
    let totalSubscribers = 0;
    let totalMemoryUsage = 0;

    this.states.forEach(state => {
      const stateStats = (state as any).getStats();
      totalSubscribers += stateStats.subscriberCount;
      totalMemoryUsage += stateStats.memoryUsage;
    });

    return {
      totalStates,
      totalSubscribers,
      totalMemoryUsage,
      averageSubscribersPerState:
        totalStates > 0 ? totalSubscribers / totalStates : 0,
      stateKeys: Array.from(this.states.keys()),
      isDestroyed: this.isDestroyed,
    };
  }

  /**
   * Destroys the state manager and all states
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      // Destroy all states
      this.states.forEach((state, key) => {
        try {
          state.destroy();
        } catch (error) {
          console.warn(`Error destroying state "${key}":`, error);
        }
      });

      this.states.clear();
      this.isDestroyed = true;
    } catch (error) {
      this.isDestroyed = true;
      throw wrapError(error, 'sharedStateManager.destroy');
    }
  }

  /**
   * Internal method to handle state destruction
   * @param key State key that was destroyed
   * @internal
   */
  _handleStateDestroyed(key: string): void {
    this.states.delete(key);
    this.dependencyGraph.delete(key);
    // Remove key from all dependency sets
    for (const deps of this.dependencyGraph.values()) {
      deps.delete(key);
    }
  }

  /**
   * Tracks state access for circular dependency detection
   * @internal
   */
  _trackStateAccess(sourceKey: string, targetKey: string): void {
    if (sourceKey === targetKey) return; // Self-access is ok

    // Add dependency
    let deps = this.dependencyGraph.get(sourceKey);
    if (!deps) {
      deps = new Set();
      this.dependencyGraph.set(sourceKey, deps);
    }
    deps.add(targetKey);

    // Check for circular dependencies
    if (this.hasCircularDependency(sourceKey, targetKey)) {
      throw BusErrorFactory.badRequest(
        'circularDependency',
        `Circular dependency detected: ${sourceKey} -> ${targetKey}`,
        { source: sourceKey, target: targetKey }
      );
    }
  }

  /**
   * Detects circular dependencies using DFS
   * @private
   */
  private hasCircularDependency(startKey: string, targetKey: string, visited = new Set<string>()): boolean {
    if (visited.has(targetKey)) {
      return targetKey === startKey;
    }

    visited.add(targetKey);
    const deps = this.dependencyGraph.get(targetKey);
    if (deps) {
      for (const dep of deps) {
        if (this.hasCircularDependency(startKey, dep, visited)) {
          return true;
        }
      }
    }

    visited.delete(targetKey);
    return false;
  }

  /**
   * Begins tracking access for a state
   * @internal
   */
  _beginStateAccess(key: string): void {
    if (this.currentAccessStack.has(key)) {
      throw BusErrorFactory.badRequest(
        'circularAccess',
        `Circular state access detected: ${key}`,
        { key, accessStack: Array.from(this.currentAccessStack) }
      );
    }
    this.currentAccessStack.add(key);
  }

  /**
   * Ends tracking access for a state
   * @internal
   */
  _endStateAccess(key: string): void {
    this.currentAccessStack.delete(key);
  }

  /**
   * Checks if state manager is destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Throws error if state manager is destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone(
        'sharedStateManager',
        'Shared state manager has been destroyed'
      );
    }
  }
}

/**
 * Implementation of reactive shared state
 */
export class SharedStateImpl<T> implements SharedState<T> {
  private value: T;
  private subscribers = new Set<(value: T) => void>();
  private isDestroyed = false;
  private unsubscribeFromBus: (() => void) | null = null;
  private updateSequence = 0;
  private lastRemoteSequence = -1;

  constructor(
    private key: string,
    initialValue: T,
    private bus: EventBus,
    private managerRef: WeakRef<SharedStateManager>
  ) {
    this.value = this.cloneValue(initialValue);
    this.setupCrossAppSynchronization();
  }

  /**
   * Gets the current state value
   * @returns Current state value
   */
  get(): T {
    this.throwIfDestroyed();

    // Track access for circular dependency detection
    const manager = this.managerRef.deref();
    if (manager) {
      manager._beginStateAccess(this.key);
    }

    try {
      const trackingContext = (globalThis as any).__CONNECTIC_TRACKING_CONTEXT__;
      if (trackingContext && trackingContext.isTracking) {
        trackingContext.dependencies.add(this);
      }

      return this.cloneValue(this.value);
    } finally {
      if (manager) {
        manager._endStateAccess(this.key);
      }
    }
  }

  /**
   * Sets a new state value and notifies all subscribers
   * @param value New state value
   */
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

  /**
   * Subscribes to state changes
   * @param callback Function to call when state changes
   * @returns Unsubscribe function
   */
  subscribe(callback: (value: T) => void): () => void {
    this.throwIfDestroyed();

    try {
      if (typeof callback !== 'function') {
        throw BusErrorFactory.badRequest(
          'subscribe',
          'Callback must be a function',
          { key: this.key, callback: typeof callback }
        );
      }

      this.subscribers.add(callback);

      // Return unsubscribe function
      return () => {
        this.subscribers.delete(callback);
      };
    } catch (error) {
      throw wrapError(error, `subscribe:${this.key}`);
    }
  }

  /**
   * Updates state using a function that receives current value
   * @param updater Function that receives current value and returns new value
   */
  update(updater: (currentValue: T) => T): void {
    this.throwIfDestroyed();

    try {
      if (typeof updater !== 'function') {
        throw BusErrorFactory.badRequest(
          'update',
          'Updater must be a function',
          { key: this.key, updater: typeof updater }
        );
      }

      const currentValue = this.get();
      const newValue = updater(currentValue);
      this.set(newValue);
    } catch (error) {
      throw wrapError(error, `update:${this.key}`);
    }
  }

  /**
   * Gets statistics about this state instance
   * @returns State statistics
   */
  getStats(): object {
    return {
      key: this.key,
      subscriberCount: this.subscribers.size,
      memoryUsage:
        estimateObjectSize(this.value) + estimateObjectSize(this.subscribers),
      hasValue: this.value !== undefined && this.value !== null,
      valueType: typeof this.value,
      isDestroyed: this.isDestroyed,
    };
  }

  /**
   * Destroys the state instance and cleans up resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      try {
        this.bus.emit(`state:${this.key}:destroyed`, { key: this.key });
      } catch (error) {
        console.warn(
          `Failed to emit destruction event for state ${this.key}:`,
          error
        );
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
          console.warn(
            `Error notifying subscriber during state destruction:`,
            error
          );
        }
      });

      // Clear value reference to help garbage collection
      this.value = undefined as any;

      // Notify manager of destruction
      const manager = this.managerRef.deref();
      if (manager) {
        manager._handleStateDestroyed(this.key);
      }

      this.isDestroyed = true;
    } catch (error) {
      this.isDestroyed = true;
      throw wrapError(error, `destroyState:${this.key}`);
    }
  }

  /**
   * Checks if state is destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Sets up cross-application state synchronization
   * @private
   */
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

  /**
   * Notifies all subscribers of a state change
   * @private
   */
  private notifySubscribers(value: T): void {
    const clonedValue = this.cloneValue(value);

    this.subscribers.forEach(callback => {
      safeExecute(
        () => callback(clonedValue),
        `state subscriber for '${this.key}'`
      );
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
   * Compares two values for equality (deep comparison for objects)
   * @private
   */
  private valuesEqual(a: T, b: T): boolean {
    if (a === b) {
      return true;
    }

    if (a === null || b === null || a === undefined || b === undefined) {
      return a === b;
    }

    if (typeof a !== typeof b) {
      return false;
    }

    if (typeof a === 'object' && typeof b === 'object') {
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
   * Throws error if state is destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone(
        `state:${this.key}`,
        'State has been destroyed'
      );
    }
  }
}

/**
 * Utility functions for working with shared state
 */
export class SharedStateUtils {
  /**
   * Creates a state that persists to localStorage (browser only)
   * @param manager State manager instance
   * @param key State key
   * @param initialValue Initial value
   * @param storageKey Optional localStorage key (defaults to state key)
   * @returns Shared state with localStorage persistence
   */
  static createPersistedState<T>(
    manager: SharedStateManager,
    key: string,
    initialValue: T,
    storageKey?: string
  ): SharedState<T> {
    const storage = storageKey || `connectic_state_${key}`;

    // Try to load from localStorage
    let storedValue = initialValue;
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(storage);
        if (stored !== null) {
          storedValue = JSON.parse(stored);
        }
      } catch (error) {
        console.warn(`Failed to load persisted state for "${key}":`, error);
      }
    }

    // Create state with stored/initial value
    const state = manager.createState(key, storedValue);

    // Subscribe to changes and persist to localStorage
    if (typeof localStorage !== 'undefined') {
      state.subscribe(value => {
        try {
          localStorage.setItem(storage, JSON.stringify(value));
        } catch (error) {
          console.warn(`Failed to persist state for "${key}":`, error);
        }
      });
    }

    return state;
  }

  /**
   * Creates a computed state that derives from multiple source states
   * @param manager State manager instance
   * @param sources Array of state keys to depend on
   * @param computeFn Function to compute derived value
   * @returns Shared state with computed value
   */
  static createDerivedState<T>(
    manager: SharedStateManager,
    sources: string[],
    computeFn: (...values: any[]) => T
  ): SharedState<T> {
    // Get initial values and compute initial result
    const initialValues = sources.map(key => manager.getStateValue(key));
    const initialValue = computeFn(...initialValues);

    // Create derived state
    const derivedKey = `derived_${sources.join('_')}_${Date.now()}`;
    const derivedState = manager.createState(derivedKey, initialValue);

    // Set up subscriptions to source states
    const unsubscribers: (() => void)[] = [];

    const recompute = () => {
      try {
        const currentValues = sources.map(key => manager.getStateValue(key));
        const newValue = computeFn(...currentValues);
        derivedState.set(newValue);
      } catch (error) {
        console.warn(`Error recomputing derived state:`, error);
      }
    };

    sources.forEach(sourceKey => {
      const sourceState = manager.getState(sourceKey);
      if (sourceState) {
        const unsubscribe = sourceState.subscribe(() => recompute());
        unsubscribers.push(unsubscribe);
      }
    });

    // Override destroy to clean up subscriptions
    const originalDestroy = derivedState.destroy.bind(derivedState);
    derivedState.destroy = () => {
      unsubscribers.forEach(unsub => unsub());
      originalDestroy();
    };

    return derivedState;
  }

  /**
   * Creates a debounced state that only updates after a delay
   * @param manager State manager instance
   * @param key State key
   * @param initialValue Initial value
   * @param delayMs Debounce delay in milliseconds
   * @returns Debounced shared state
   */
  static createDebouncedState<T>(
    manager: SharedStateManager,
    key: string,
    initialValue: T,
    delayMs: number
  ): SharedState<T> {
    const state = manager.createState(key, initialValue);
    let timeoutId: NodeJS.Timeout | null = null;

    // Override set method with debouncing
    const originalSet = state.set.bind(state);
    state.set = (value: T) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        originalSet(value);
        timeoutId = null;
      }, delayMs);
    };

    return state;
  }
}
