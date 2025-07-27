/**
 * connectic - Bus Registry Implementation
 *
 * This file manages global bus instances to enable cross-application communication.
 * It handles storage in different environments (browser, Node.js, Web Workers).
 */

import { BusErrorFactory, wrapError } from '../errors';
import { BusConfig } from '../types';
import { getGlobalStore, isValidEventName } from './utils';

/**
 * Interface that bus instances must implement to be managed by the registry
 */
interface RegistrableBus {
  destroy(): void;
  isDestroyedState(): boolean;
  getStats(): any;
}

/**
 * Global registry for managing bus instances across applications
 * Enables cross-app communication by ensuring single instances are shared
 */
export class BusRegistry {
  private static instances = new Map<string, RegistrableBus>();
  private static fallbackStore: Map<string, RegistrableBus> | null = null;
  private static isInitialized = false;

  /**
   * Initializes the registry and sets up global storage
   * @private
   */
  private static initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Use atomic check-and-set pattern
    const INIT_KEY = 'CONNECTIC_INITIALIZING';
    const INSTANCES_KEY = 'CONNECTIC_INSTANCES';

    try {
      const globalStore = getGlobalStore();

      // Atomic initialization check
      if (globalStore.has(INIT_KEY)) {
        let attempts = 0;
        while (globalStore.has(INIT_KEY) && attempts < 100) {
          // Busy wait with backoff (max 1 second total)
          const delay = Math.min(attempts * 10, 100);
          // Use synchronous delay for initialization
          const start = Date.now();
          while (Date.now() - start < delay) {
            /* busy wait */
          }
          attempts++;
        }

        if (globalStore.has(INIT_KEY)) {
          throw new Error('Registry initialization deadlock detected');
        }
      }

      // Set initialization lock
      globalStore.set(INIT_KEY, true);

      try {
        // Check if another instance already exists
        if (globalStore.has(INSTANCES_KEY)) {
          this.instances = globalStore.get(INSTANCES_KEY);
        } else {
          globalStore.set(INSTANCES_KEY, this.instances);
        }

        this.isInitialized = true;
      } finally {
        // Always remove initialization lock
        globalStore.delete(INIT_KEY);
      }
    } catch (error) {
      // Fall back to module-level storage if global storage fails
      console.warn(
        'Failed to initialize global bus registry, using fallback storage:',
        error
      );
      this.fallbackStore = new Map();
      this.isInitialized = true;
    }
  }

  /**
   * Gets the storage instance (global or fallback)
   * @private
   */
  private static getStorage(): Map<string, RegistrableBus> {
    this.initialize();
    return this.fallbackStore || this.instances;
  }

  /**
   * Creates a new bus instance or returns existing one
   * @param config Bus configuration
   * @param BusClass Constructor for the bus implementation
   * @returns Bus instance
   */
  static create<T extends RegistrableBus>(
    config: BusConfig,
    BusClass: new (config: BusConfig) => T
  ): T {
    try {
      if (!isValidEventName(config.name)) {
        throw BusErrorFactory.badRequest(
          'registry.create',
          'Bus name must be a valid identifier',
          { name: config.name }
        );
      }

      const storage = this.getStorage();

      // Check if bus already exists
      if (storage.has(config.name)) {
        const existingBus = storage.get(config.name)!;

        // Verify existing bus is still valid
        if (!existingBus.isDestroyedState()) {
          console.warn(
            `Bus with name "${config.name}" already exists. Returning existing instance.`
          );
          return existingBus as T;
        } else {
          // Clean up destroyed bus
          storage.delete(config.name);
        }
      }

      // Create new bus instance
      const bus = new BusClass(config);
      storage.set(config.name, bus);

      // Set up cleanup on bus destruction
      this.setupBusCleanup(config.name, bus);

      return bus;
    } catch (error) {
      throw wrapError(error, `registry.create:${config.name}`);
    }
  }

  /**
   * Retrieves an existing bus instance
   * @param name Bus name
   * @returns Bus instance or null if not found
   */
  static get<T extends RegistrableBus>(name: string): T | null {
    try {
      if (!isValidEventName(name)) {
        throw BusErrorFactory.badRequest(
          'registry.get',
          'Bus name must be a valid identifier',
          { name }
        );
      }

      const storage = this.getStorage();
      const bus = storage.get(name);

      if (!bus) {
        return null;
      }

      // Check if bus is still valid
      if (bus.isDestroyedState()) {
        storage.delete(name);
        return null;
      }

      return bus as T;
    } catch (error) {
      throw wrapError(error, `registry.get:${name}`);
    }
  }

  /**
   * Checks if a bus with the given name exists
   * @param name Bus name
   * @returns True if bus exists and is not destroyed
   */
  static has(name: string): boolean {
    try {
      if (!isValidEventName(name)) {
        return false;
      }

      const storage = this.getStorage();
      const bus = storage.get(name);

      if (!bus) {
        return false;
      }

      // Check if bus is still valid
      if (bus.isDestroyedState()) {
        storage.delete(name);
        return false;
      }

      return true;
    } catch (error) {
      // Return false instead of throwing for existence checks
      console.warn(`Error checking bus existence for "${name}":`, error);
      return false;
    }
  }

  /**
   * Removes and destroys a bus instance
   * @param name Bus name
   * @returns True if bus was removed, false if not found
   */
  static remove(name: string): boolean {
    try {
      if (!isValidEventName(name)) {
        throw BusErrorFactory.badRequest(
          'registry.remove',
          'Bus name must be a valid identifier',
          { name }
        );
      }

      const storage = this.getStorage();
      const bus = storage.get(name);

      if (!bus) {
        return false;
      }

      // Destroy the bus if it's not already destroyed
      try {
        if (!bus.isDestroyedState()) {
          bus.destroy();
        }
      } catch (error) {
        console.warn(`Error destroying bus "${name}":`, error);
      }

      // Remove from storage
      return storage.delete(name);
    } catch (error) {
      throw wrapError(error, `registry.remove:${name}`);
    }
  }

  /**
   * Removes and destroys all bus instances
   */
  static clear(): void {
    try {
      const storage = this.getStorage();

      // Destroy all buses
      storage.forEach((bus, name) => {
        try {
          if (!bus.isDestroyedState()) {
            bus.destroy();
          }
        } catch (error) {
          console.warn(`Error destroying bus "${name}" during clear:`, error);
        }
      });

      // Clear storage
      storage.clear();
    } catch (error) {
      throw wrapError(error, 'registry.clear');
    }
  }

  /**
   * Gets all registered bus names
   * @returns Array of bus names
   */
  static getAll(): string[] {
    try {
      const storage = this.getStorage();
      const names: string[] = [];

      // Filter out destroyed buses
      storage.forEach((bus, name) => {
        if (!bus.isDestroyedState()) {
          names.push(name);
        } else {
          // Clean up destroyed buses
          storage.delete(name);
        }
      });

      return names;
    } catch (error) {
      throw wrapError(error, 'registry.getAll');
    }
  }

  /**
   * Gets statistics for all registered buses
   * @returns Object mapping bus names to their stats
   */
  static getAllStats(): Record<string, any> {
    try {
      const storage = this.getStorage();
      const stats: Record<string, any> = {};

      storage.forEach((bus, name) => {
        if (!bus.isDestroyedState()) {
          try {
            stats[name] = bus.getStats();
          } catch (error) {
            stats[name] = {
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }
      });

      return stats;
    } catch (error) {
      throw wrapError(error, 'registry.getAllStats');
    }
  }

  /**
   * Gets registry metadata and health information
   * @returns Registry information
   */
  static getRegistryInfo(): object {
    try {
      const storage = this.getStorage();
      let validBuses = 0;
      let destroyedBuses = 0;

      storage.forEach(bus => {
        if (bus.isDestroyedState()) {
          destroyedBuses++;
        } else {
          validBuses++;
        }
      });

      return {
        totalBuses: storage.size,
        validBuses,
        destroyedBuses,
        isInitialized: this.isInitialized,
        usingFallbackStorage: this.fallbackStore !== null,
        storageType: this.fallbackStore ? 'fallback' : 'global',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        isInitialized: this.isInitialized,
        usingFallbackStorage: this.fallbackStore !== null,
      };
    }
  }

  /**
   * Performs cleanup operations on the registry
   * Removes destroyed buses and optimizes memory usage
   */
  static cleanup(): void {
    try {
      const storage = this.getStorage();
      const toRemove: string[] = [];

      // Identify destroyed buses
      storage.forEach((bus, name) => {
        if (bus.isDestroyedState()) {
          toRemove.push(name);
        }
      });

      // Remove destroyed buses
      toRemove.forEach(name => {
        storage.delete(name);
      });

      // Force garbage collection hint (if available)
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
    } catch (error) {
      console.warn('Registry cleanup failed:', error);
    }
  }

  /**
   * Sets up automatic cleanup when a bus is destroyed
   * @private
   */
  private static setupBusCleanup(name: string, bus: RegistrableBus): void {
    // Store original destroy method
    const originalDestroy = bus.destroy.bind(bus);

    // Override destroy to include registry cleanup
    bus.destroy = () => {
      try {
        originalDestroy();
      } finally {
        // Remove from registry after destruction
        const storage = this.getStorage();
        storage.delete(name);
      }
    };
  }

  /**
   * Force reinitialization of the registry (for testing)
   * @private
   */
  static _reset(): void {
    this.instances.clear();
    this.fallbackStore = null;
    this.isInitialized = false;
  }
}

/**
 * Convenience factory function for creating bus instances
 * @param config Bus configuration
 * @param BusClass Constructor for the bus implementation
 * @returns Bus instance
 */
export function createBusInstance<T extends RegistrableBus>(
  config: BusConfig,
  BusClass: new (config: BusConfig) => T
): T {
  return BusRegistry.create(config, BusClass);
}

/**
 * Convenience function for getting existing bus instances
 * @param name Bus name
 * @returns Bus instance or null
 */
export function getBusInstance<T extends RegistrableBus>(
  name: string
): T | null {
  return BusRegistry.get<T>(name);
}

/**
 * Convenience function for getting or creating bus instances
 * @param config Bus configuration
 * @param BusClass Constructor for the bus implementation
 * @returns Bus instance (existing or new)
 */
export function getOrCreateBusInstance<T extends RegistrableBus>(
  config: BusConfig,
  BusClass: new (config: BusConfig) => T
): T {
  const existing = BusRegistry.get<T>(config.name);
  if (existing) {
    return existing;
  }
  return BusRegistry.create(config, BusClass);
}

/**
 * Convenience function for removing bus instances
 * @param name Bus name
 * @returns True if removed
 */
export function removeBusInstance(name: string): boolean {
  return BusRegistry.remove(name);
}

/**
 * Convenience function for clearing all bus instances
 */
export function clearAllBusInstances(): void {
  BusRegistry.clear();
}

/**
 * Convenience function for listing all bus names
 * @returns Array of bus names
 */
export function listBusInstances(): string[] {
  return BusRegistry.getAll();
}
