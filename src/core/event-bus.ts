/**
 * connectic - Core Event Bus Implementation
 *
 * This file contains the foundational event bus that provides pub/sub functionality.
 * All other communication patterns are built on top of this core infrastructure.
 */

import { BusErrorFactory, wrapError } from '../errors';
import { BusStats } from '../types';
import {
  estimateObjectSize,
  isValidEventName,
  safeExecute,
  validateParameters,
} from './utils';

/**
 * Core event bus providing pub/sub functionality
 * This is the foundation that all other communication patterns build upon
 */
export class EventBus {
  private listeners = new Map<string, Set<Function>>();
  private stats = {
    totalEvents: 0,
    totalSubscriptions: 0,
    totalUnsubscriptions: 0,
    errorCount: 0,
  };
  private isDestroyed = false;
  private maxListeners = 100; // Per event limit to prevent memory leaks

  /**
   * Emits an event to all registered listeners
   * @param event Event name to emit
   * @param payload Data to send with the event
   */
  emit(event: string, payload: any): void {
    this.throwIfDestroyed();

    try {
      validateParameters(event);

      this.stats.totalEvents++;

      const handlers = this.listeners.get(event);
      if (!handlers || handlers.size === 0) {
        return; // No listeners, silently return
      }

      // Execute handlers in isolation to prevent one error from affecting others
      handlers.forEach(handler => {
        safeExecute(() => handler(payload), `event handler for '${event}'`);
      });
    } catch (error) {
      this.stats.errorCount++;
      throw wrapError(error, event);
    }
  }

  /**
   * Subscribes to an event
   * @param event Event name to listen for
   * @param handler Function to call when event is emitted
   * @returns Unsubscribe function
   */
  on(event: string, handler: Function): () => void {
    this.throwIfDestroyed();

    try {
      validateParameters(event, handler);

      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }

      const eventListeners = this.listeners.get(event)!;

      // Check listener limit to prevent memory leaks
      if (eventListeners.size >= this.maxListeners) {
        throw BusErrorFactory.internal(
          `Maximum listeners (${this.maxListeners}) exceeded for event: ${event}`,
          undefined,
          { event, currentListeners: eventListeners.size }
        );
      }

      eventListeners.add(handler);
      this.stats.totalSubscriptions++;

      // Return unsubscribe function
      return () => this.off(event, handler);
    } catch (error) {
      this.stats.errorCount++;
      throw wrapError(error, event);
    }
  }

  /**
   * Subscribes to an event for one-time execution
   * @param event Event name to listen for
   * @param handler Function to call when event is emitted (once)
   * @returns Unsubscribe function
   */
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

  /**
   * Removes a specific event handler
   * @param event Event name
   * @param handler Handler function to remove
   */
  off(event: string, handler: Function): void {
    this.throwIfDestroyed();

    try {
      validateParameters(event, handler);

      const eventListeners = this.listeners.get(event);
      if (!eventListeners) {
        return; // Event not found, silently return
      }

      const removed = eventListeners.delete(handler);
      if (removed) {
        this.stats.totalUnsubscriptions++;
      }

      // Clean up empty event sets to prevent memory leaks
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    } catch (error) {
      this.stats.errorCount++;
      throw wrapError(error, event);
    }
  }

  /**
   * Removes all listeners for an event, or all listeners if no event specified
   * @param event Optional event name to target specific event
   */
  removeAllListeners(event?: string): void {
    this.throwIfDestroyed();

    try {
      if (event !== undefined) {
        validateParameters(event);

        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
          this.stats.totalUnsubscriptions += eventListeners.size;
          this.listeners.delete(event);
        }
      } else {
        // Remove all listeners for all events
        let totalRemoved = 0;
        this.listeners.forEach(listeners => {
          totalRemoved += listeners.size;
        });
        this.stats.totalUnsubscriptions += totalRemoved;
        this.listeners.clear();
      }
    } catch (error) {
      this.stats.errorCount++;
      throw wrapError(error, event);
    }
  }

  /**
   * Gets the number of listeners for a specific event
   * @param event Event name
   * @returns Number of listeners
   */
  getListenerCount(event: string): number {
    this.throwIfDestroyed();

    try {
      validateParameters(event);
      return this.listeners.get(event)?.size || 0;
    } catch (error) {
      this.stats.errorCount++;
      throw wrapError(error, event);
    }
  }

  /**
   * Checks if an event has any listeners
   * @param event Event name
   * @returns True if event has listeners
   */
  hasListeners(event: string): boolean {
    this.throwIfDestroyed();

    try {
      validateParameters(event);
      return this.getListenerCount(event) > 0;
    } catch (error) {
      this.stats.errorCount++;
      throw wrapError(error, event);
    }
  }

  /**
   * Gets all event names that have listeners
   * @returns Array of event names
   */
  getEventNames(): string[] {
    this.throwIfDestroyed();
    return Array.from(this.listeners.keys());
  }

  /**
   * Gets comprehensive statistics about the event bus
   * @returns Bus statistics object
   */
  getStats(): BusStats {
    const activeListeners = Array.from(this.listeners.values()).reduce(
      (total, listeners) => total + listeners.size,
      0
    );

    const memoryUsage = estimateObjectSize(this.listeners);

    return {
      totalEvents: this.stats.totalEvents,
      totalRequests: 0, // Will be overridden by request-response layer
      activeListeners,
      cacheSize: 0, // Will be overridden by cache layer
      memoryUsage,
    };
  }

  /**
   * Gets detailed internal statistics for debugging
   * @returns Extended statistics object
   */
  getDetailedStats(): object {
    const baseStats = this.getStats();

    return {
      ...baseStats,
      totalSubscriptions: this.stats.totalSubscriptions,
      totalUnsubscriptions: this.stats.totalUnsubscriptions,
      errorCount: this.stats.errorCount,
      eventCount: this.listeners.size,
      maxListenersPerEvent: this.maxListeners,
      isDestroyed: this.isDestroyed,
    };
  }

  /**
   * Sets the maximum number of listeners per event
   * @param max Maximum listeners (default: 100)
   */
  setMaxListeners(max: number): void {
    if (typeof max !== 'number' || max < 1 || !Number.isInteger(max)) {
      throw BusErrorFactory.badRequest(
        'setMaxListeners',
        'Max listeners must be a positive integer',
        { provided: max }
      );
    }

    this.maxListeners = max;
  }

  /**
   * Gets the current maximum listeners setting
   * @returns Maximum listeners per event
   */
  getMaxListeners(): number {
    return this.maxListeners;
  }

  /**
   * Checks if the event bus has been destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Destroys the event bus and cleans up all resources
   * This operation is irreversible
   */
  destroy(): void {
    if (this.isDestroyed) {
      return; // Already destroyed
    }

    try {
      // Clear all listeners
      this.listeners.clear();

      // Reset stats
      this.stats = {
        totalEvents: 0,
        totalSubscriptions: 0,
        totalUnsubscriptions: 0,
        errorCount: 0,
      };

      // Mark as destroyed
      this.isDestroyed = true;
    } catch (error) {
      // Even if cleanup fails, mark as destroyed
      this.isDestroyed = true;
      throw wrapError(error, 'destroy');
    }
  }

  /**
   * Creates a filtered view of the event bus for a specific namespace
   * @param namespace Namespace prefix to filter events
   * @returns Namespaced event bus wrapper
   */
  createNamespace(namespace: string): NamespacedEventBus {
    this.throwIfDestroyed();

    if (!isValidEventName(namespace)) {
      throw BusErrorFactory.badRequest(
        'createNamespace',
        'Namespace must be a valid event name',
        { namespace }
      );
    }

    return new NamespacedEventBus(this, namespace);
  }

  /**
   * Throws an error if the bus has been destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone('event-bus', 'Event bus has been destroyed');
    }
  }
}

/**
 * Namespaced wrapper around EventBus that automatically prefixes events
 */
export class NamespacedEventBus {
  constructor(
    private eventBus: EventBus,
    private namespace: string
  ) {}

  /**
   * Emits a namespaced event
   * @param event Event name (will be prefixed with namespace)
   * @param payload Event payload
   */
  emit(event: string, payload: any): void {
    this.eventBus.emit(`${this.namespace}:${event}`, payload);
  }

  /**
   * Subscribes to a namespaced event
   * @param event Event name (will be prefixed with namespace)
   * @param handler Event handler
   * @returns Unsubscribe function
   */
  on(event: string, handler: Function): () => void {
    return this.eventBus.on(`${this.namespace}:${event}`, handler);
  }

  /**
   * Subscribes to a namespaced event for one-time execution
   * @param event Event name (will be prefixed with namespace)
   * @param handler Event handler
   * @returns Unsubscribe function
   */
  once(event: string, handler: Function): () => void {
    return this.eventBus.once(`${this.namespace}:${event}`, handler);
  }

  /**
   * Removes a specific handler from a namespaced event
   * @param event Event name (will be prefixed with namespace)
   * @param handler Handler to remove
   */
  off(event: string, handler: Function): void {
    this.eventBus.off(`${this.namespace}:${event}`, handler);
  }

  /**
   * Removes all listeners for a namespaced event
   * @param event Optional event name (will be prefixed with namespace)
   */
  removeAllListeners(event?: string): void {
    if (event !== undefined) {
      this.eventBus.removeAllListeners(`${this.namespace}:${event}`);
    } else {
      // Remove all listeners for this namespace
      const allEvents = this.eventBus.getEventNames();
      const namespacePrefix = `${this.namespace}:`;

      allEvents
        .filter(eventName => eventName.startsWith(namespacePrefix))
        .forEach(eventName => this.eventBus.removeAllListeners(eventName));
    }
  }

  /**
   * Gets listener count for a namespaced event
   * @param event Event name (will be prefixed with namespace)
   * @returns Number of listeners
   */
  getListenerCount(event: string): number {
    return this.eventBus.getListenerCount(`${this.namespace}:${event}`);
  }

  /**
   * Checks if a namespaced event has listeners
   * @param event Event name (will be prefixed with namespace)
   * @returns True if event has listeners
   */
  hasListeners(event: string): boolean {
    return this.eventBus.hasListeners(`${this.namespace}:${event}`);
  }

  /**
   * Gets all event names within this namespace
   * @returns Array of event names (without namespace prefix)
   */
  getEventNames(): string[] {
    const allEvents = this.eventBus.getEventNames();
    const namespacePrefix = `${this.namespace}:`;

    return allEvents
      .filter(eventName => eventName.startsWith(namespacePrefix))
      .map(eventName => eventName.substring(namespacePrefix.length));
  }

  /**
   * Gets the namespace prefix
   * @returns Namespace string
   */
  getNamespace(): string {
    return this.namespace;
  }

  /**
   * Creates a sub-namespace
   * @param subNamespace Sub-namespace name
   * @returns Nested namespaced event bus
   */
  //   namespace(subNamespace: string): NamespacedEventBus {
  //     return this.eventBus.createNamespace(`${this.namespace}:${subNamespace}`)
  //   }

  /**
   * Destroys this namespaced view (removes all listeners in namespace)
   */
  destroy(): void {
    this.removeAllListeners();
  }
}
