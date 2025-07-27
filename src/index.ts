/**
 * connectic - Main Entry Point
 * 
 * This is the main entry point for the connectic library.
 * It provides the unified MFEBus class and factory functions.
 */

import { 
  BusConfig, 
  MFEBus as IMFEBus, 
  BusStats,
  RequestOptions,
  RequestManyOptions,
  BatchRequest,
  SharedState,
  ComputedState,
  BusPlugin,
  HookType,
  HookHandler,
  CacheManager as ICacheManager,
  RequestInterceptor,
  ResponseInterceptor
} from './types'
import { BusError, BusErrorCode, BusErrorFactory, wrapError } from './errors'
import { validateParameters } from './core/utils'
import { 
  EventBus, 
  BusRegistry,
  MiddlewareManager,
  ResponderBuilder,
  SharedStateManager,
  ComputedStateManager,
  CacheManager,
  RequestResponseManager,
  InterceptorManager
} from './core'

/**
 * Main bus class that combines all connectic functionality
 */
export class MFEBus<
  TEventMap extends Record<string, any> = {},
  TRequestMap extends Record<string, any> = {}
> implements IMFEBus<TEventMap, TRequestMap> {
  private eventBus: EventBus
  private middleware: MiddlewareManager
  private stateManager: SharedStateManager
  private computedManager: ComputedStateManager
  private cacheManager: CacheManager
  private requestManager: RequestResponseManager
  private interceptorManager: InterceptorManager
  private config: BusConfig
  private namespacePath: string
  private namespacedEventCache = new Map<string, string>();
  private isDestroyed = false

  constructor(config: BusConfig, namespacePath: string = '') {
    try {
      this.config = config
      this.namespacePath = namespacePath

      // Initialize core components
      this.eventBus = new EventBus()
      this.middleware = new MiddlewareManager(this)
      this.stateManager = new SharedStateManager(this.eventBus)
      this.computedManager = new ComputedStateManager()
      this.cacheManager = new CacheManager(config.cache)
      this.requestManager = new RequestResponseManager(this.eventBus, this.cacheManager)
      this.interceptorManager = new InterceptorManager()

    } catch (error) {
      throw wrapError(error, `MFEBus.constructor:${config.name}`)
    }
  }

  // ===== Event Communication =====

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    this.throwIfDestroyed()
    
    try {
      const eventName = this.namespacedEvent(event as string)
      
      // Run before emit hooks
      this.middleware.runHooks('beforeEmit', eventName, payload)
      
      // Apply request interceptors
      const interceptedPayload = this.interceptorManager.applyRequestInterceptors(eventName, payload)
      
      // Emit event
      this.eventBus.emit(eventName, interceptedPayload)
      
      // Run after emit hooks
      this.middleware.runHooks('afterEmit', eventName, payload)

    } catch (error) {
      throw wrapError(error, `emit:${String(event)}`)
    }
  }

  on<K extends keyof TEventMap>(
    event: K, 
    handler: (payload: TEventMap[K]) => void
  ): () => void {
    this.throwIfDestroyed()
    
    try {
      const eventName = this.namespacedEvent(event as string)
      
      // Run before on hooks
      this.middleware.runHooks('beforeOn', eventName)
      
      // Wrap handler with response interceptors
      const wrappedHandler = (payload: any) => {
        try {
          const interceptedPayload = this.interceptorManager.applyResponseInterceptors(eventName, payload)
          handler(interceptedPayload)
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error)
        }
      }
      
      const unsubscribe = this.eventBus.on(eventName, wrappedHandler)
      
      // Run after on hooks
      this.middleware.runHooks('afterOn', eventName)
      
      return unsubscribe

    } catch (error) {
      throw wrapError(error, `on:${String(event)}`)
    }
  }

  once<K extends keyof TEventMap>(
    event: K, 
    handler: (payload: TEventMap[K]) => void
  ): () => void {
    this.throwIfDestroyed()
    
    try {
      const eventName = this.namespacedEvent(event as string)
      
      // Wrap handler with response interceptors
      const wrappedHandler = (payload: any) => {
        try {
          const interceptedPayload = this.interceptorManager.applyResponseInterceptors(eventName, payload)
          handler(interceptedPayload)
        } catch (error) {
          console.error(`Error in once handler for ${eventName}:`, error)
        }
      }
      
      return this.eventBus.once(eventName, wrappedHandler)

    } catch (error) {
      throw wrapError(error, `once:${String(event)}`)
    }
  }

  off<K extends keyof TEventMap>(event: K, handler: Function): void {
    this.throwIfDestroyed()
    
    try {
      const eventName = this.namespacedEvent(event as string)
      this.eventBus.off(eventName, handler)

    } catch (error) {
      throw wrapError(error, `off:${String(event)}`)
    }
  }

  removeAllListeners<K extends keyof TEventMap>(event?: K): void {
    this.throwIfDestroyed()
    
    try {
      if (event !== undefined) {
        const eventName = this.namespacedEvent(event as string)
        this.eventBus.removeAllListeners(eventName)
      } else {
        this.eventBus.removeAllListeners()
      }

    } catch (error) {
      throw wrapError(error, `removeAllListeners:${String(event)}`)
    }
  }

  // ===== Request/Response Communication =====

  async request<K extends keyof TRequestMap>(
    event: K,
    payload?: TRequestMap[K] extends { request: infer R } ? R : any,
    options?: RequestOptions
  ): Promise<TRequestMap[K] extends { response: infer R } ? R : any> {
    this.throwIfDestroyed()
    
    try {
      const eventName = this.namespacedEvent(event as string)
      return await this.requestManager.request(eventName, payload, options)

    } catch (error) {
      throw wrapError(error, `request:${String(event)}`)
    }
  }

  async requestMany<K extends keyof TRequestMap>(
    event: K,
    payload?: TRequestMap[K] extends { request: infer R } ? R : any,
    options?: RequestManyOptions
  ): Promise<Array<TRequestMap[K] extends { response: infer R } ? R : any>> {
    this.throwIfDestroyed()
    
    try {
      const eventName = this.namespacedEvent(event as string)
      return await this.requestManager.requestMany(eventName, payload, options)

    } catch (error) {
      throw wrapError(error, `requestMany:${String(event)}`)
    }
  }

  async requestBatch(requests: BatchRequest[]): Promise<any[]> {
    this.throwIfDestroyed()
    
    try {
      // Namespace all events in batch requests
      const namespacedRequests = requests.map(([event, payload, options]) => [
        this.namespacedEvent(event),
        payload,
        options
      ]) as BatchRequest[]
      
      return await this.requestManager.requestBatch(namespacedRequests)

    } catch (error) {
      throw wrapError(error, 'requestBatch')
    }
  }

  respond<K extends keyof TRequestMap>(event: K): ResponderBuilder<K> {
    this.throwIfDestroyed()
    
    try {
      const eventName = this.namespacedEvent(event as string)
      return this.requestManager.respond(eventName)

    } catch (error) {
      throw wrapError(error, `respond:${String(event)}`)
    }
  }

  // ===== State Management =====

  createState<T>(key: string, initialValue: T): SharedState<T> {
    this.throwIfDestroyed()
    
    try {
      const namespacedKey = this.namespacedEvent(key)
      return this.stateManager.createState(namespacedKey, initialValue)

    } catch (error) {
      throw wrapError(error, `createState:${key}`)
    }
  }

  createComputed<T>(computeFn: () => T): ComputedState<T> {
    this.throwIfDestroyed()
    
    try {
      return this.computedManager.createComputed(computeFn)

    } catch (error) {
      throw wrapError(error, 'createComputed')
    }
  }

  setState<K extends keyof TEventMap>(key: K, value: TEventMap[K]): void {
    this.throwIfDestroyed()
    
    try {
      const namespacedKey = this.namespacedEvent(key as string)
      this.stateManager.setState(namespacedKey, value)

    } catch (error) {
      throw wrapError(error, `setState:${String(key)}`)
    }
  }

  getState<K extends keyof TEventMap>(key: K): TEventMap[K] | undefined {
    this.throwIfDestroyed()
    
    try {
      const namespacedKey = this.namespacedEvent(key as string)
      return this.stateManager.getStateValue(namespacedKey)

    } catch (error) {
      throw wrapError(error, `getState:${String(key)}`)
    }
  }

  removeState<K extends keyof TEventMap>(key: K): void {
    this.throwIfDestroyed()
    
    try {
      const namespacedKey = this.namespacedEvent(key as string)
      this.stateManager.removeState(namespacedKey)

    } catch (error) {
      throw wrapError(error, `removeState:${String(key)}`)
    }
  }

  // ===== Plugin System =====

  use(plugin: BusPlugin): this {
    this.throwIfDestroyed()
    
    try {
      this.middleware.addPlugin(plugin)
      return this

    } catch (error) {
      throw wrapError(error, `use:${plugin?.name || 'unknown'}`)
    }
  }

  addHook(type: HookType, handler: HookHandler): void {
    this.throwIfDestroyed()
    
    try {
      this.middleware.addHook(type, handler)

    } catch (error) {
      throw wrapError(error, `addHook:${type}`)
    }
  }

  removeHook(type: HookType, handler: HookHandler): void {
    this.throwIfDestroyed()
    
    try {
      this.middleware.removeHook(type, handler)

    } catch (error) {
      throw wrapError(error, `removeHook:${type}`)
    }
  }

  // ===== Namespacing =====

  namespace(name: string): MFEBus<TEventMap, TRequestMap> {
    this.throwIfDestroyed()
    
    try {
      validateParameters(name)
      
      const newNamespacePath = this.namespacePath ? 
        `${this.namespacePath}:${name}` : 
        name
      
      return new MFEBus<TEventMap, TRequestMap>(this.config, newNamespacePath)

    } catch (error) {
      throw wrapError(error, `namespace:${name}`)
    }
  }

  // ===== Cache Management =====

  cache: ICacheManager = {
    get: (key: string) => {
      this.throwIfDestroyed()
      return this.cacheManager.get(key)
    },
    
    set: (key: string, value: any, ttl?: number) => {
      this.throwIfDestroyed()
      this.cacheManager.set(key, value, ttl)
    },
    
    invalidate: (key: string) => {
      this.throwIfDestroyed()
      return this.cacheManager.invalidate(key)
    },
    
    invalidatePattern: (pattern: string) => {
      this.throwIfDestroyed()
      return this.cacheManager.invalidatePattern(pattern)
    },
    
    clear: () => {
      this.throwIfDestroyed()
      this.cacheManager.clear()
    }
  }

  // ===== Interception =====

  interceptRequest(interceptor: RequestInterceptor): void {
    this.throwIfDestroyed()
    
    try {
      this.interceptorManager.addRequestInterceptor(interceptor)

    } catch (error) {
      throw wrapError(error, 'interceptRequest')
    }
  }

  interceptResponse(interceptor: ResponseInterceptor): void {
    this.throwIfDestroyed()
    
    try {
      this.interceptorManager.addResponseInterceptor(interceptor)

    } catch (error) {
      throw wrapError(error, 'interceptResponse')
    }
  }

  // ===== Utilities =====

  getListenerCount<K extends keyof TEventMap>(event: K): number {
    this.throwIfDestroyed()
    
    try {
      const eventName = this.namespacedEvent(event as string)
      return this.eventBus.getListenerCount(eventName)

    } catch (error) {
      throw wrapError(error, `getListenerCount:${String(event)}`)
    }
  }

  hasListeners<K extends keyof TEventMap>(event: K): boolean {
    this.throwIfDestroyed()
    
    try {
      const eventName = this.namespacedEvent(event as string)
      return this.eventBus.hasListeners(eventName)

    } catch (error) {
      throw wrapError(error, `hasListeners:${String(event)}`)
    }
  }

  getStats(): BusStats {
    this.throwIfDestroyed()
    
    try {
      const eventStats = this.eventBus.getStats()
      const requestStats = this.requestManager.getStats()
      const cacheStats = this.cacheManager.getStats()
      
      return {
        totalEvents: eventStats.totalEvents,
        totalRequests: (requestStats as any).totalRequests || 0,
        activeListeners: eventStats.activeListeners,
        cacheSize: this.cacheManager.getSize(),
        memoryUsage: eventStats.memoryUsage + (cacheStats as any).memoryUsage || 0
      }

    } catch (error) {
      throw wrapError(error, 'getStats')
    }
  }

  destroy(): void {
    if (this.isDestroyed) {
      return
    }

    try {
      // Destroy all components in reverse order
      this.interceptorManager.destroy()
      this.requestManager.destroy()
      this.cacheManager.destroy()
      this.computedManager.destroy()
      this.stateManager.destroy()
      this.middleware.destroy()
      this.eventBus.destroy()
      
      this.namespacedEventCache.clear();
      this.isDestroyed = true

    } catch (error) {
      this.isDestroyed = true
      throw wrapError(error, 'MFEBus.destroy')
    }
  }

  // ===== Internal Methods =====

  /**
   * Checks if the bus has been destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed
  }

  /**
   * Gets detailed information about all bus components
   * @returns Detailed bus information
   */
  getDetailedInfo(): object {
    this.throwIfDestroyed()
    
    try {
      return {
        config: this.config,
        namespacePath: this.namespacePath,
        eventBus: this.eventBus.getDetailedStats(),
        middleware: this.middleware.getStats(),
        stateManager: this.stateManager.getStats(),
        computedManager: this.computedManager.getStats(),
        cacheManager: this.cacheManager.getDetailedInfo(),
        requestManager: this.requestManager.getDetailedInfo(),
        interceptorManager: this.interceptorManager.getStats(),
        isDestroyed: this.isDestroyed
      }

    } catch (error) {
      throw wrapError(error, 'getDetailedInfo')
    }
  }

  /**
   * Creates a namespaced event name
   * @private
   */
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

  /**
   * Throws error if bus is destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone(`MFEBus:${this.config.name}`, 'Bus has been destroyed')
    }
  }
}

// ===== Factory Functions =====

/**
 * Creates a new bus instance
 * @param config Bus configuration
 * @returns New MFEBus instance
 */
export function createBus<
  TEventMap extends Record<string, any> = {},
  TRequestMap extends Record<string, any> = {}
>(config: BusConfig): MFEBus<TEventMap, TRequestMap> {
  try {
    validateParameters(config.name)
    return BusRegistry.create(config, MFEBus) as MFEBus<TEventMap, TRequestMap>
  } catch (error) {
    throw wrapError(error, `createBus:${config.name}`)
  }
}

/**
 * Gets an existing bus instance
 * @param name Bus name
 * @returns Existing MFEBus instance or null
 */
export function getBus<
  TEventMap extends Record<string, any> = {},
  TRequestMap extends Record<string, any> = {}
>(name: string): MFEBus<TEventMap, TRequestMap> | null {
  try {
    validateParameters(name)
    return BusRegistry.get<MFEBus<TEventMap, TRequestMap>>(name)
  } catch (error) {
    throw wrapError(error, `getBus:${name}`)
  }
}

/**
 * Gets existing bus or creates new one
 * @param config Bus configuration
 * @returns MFEBus instance (existing or new)
 */
export function getOrCreateBus<
  TEventMap extends Record<string, any> = {},
  TRequestMap extends Record<string, any> = {}
>(config: BusConfig): MFEBus<TEventMap, TRequestMap> {
  try {
    validateParameters(config.name)
    
    const existing = BusRegistry.get<MFEBus<TEventMap, TRequestMap>>(config.name)
    if (existing) {
      return existing
    }
    
    return BusRegistry.create(config, MFEBus) as MFEBus<TEventMap, TRequestMap>
  } catch (error) {
    throw wrapError(error, `getOrCreateBus:${config.name}`)
  }
}

/**
 * Removes and destroys a bus instance
 * @param name Bus name
 * @returns True if removed
 */
export function removeBus(name: string): boolean {
  try {
    validateParameters(name)
    return BusRegistry.remove(name)
  } catch (error) {
    throw wrapError(error, `removeBus:${name}`)
  }
}

/**
 * Removes and destroys all bus instances
 */
export function clearAllBuses(): void {
  try {
    BusRegistry.clear()
  } catch (error) {
    throw wrapError(error, 'clearAllBuses')
  }
}

/**
 * Gets all registered bus names
 * @returns Array of bus names
 */
export function listBuses(): string[] {
  try {
    return BusRegistry.getAll()
  } catch (error) {
    throw wrapError(error, 'listBuses')
  }
}

/**
 * Gets statistics for all buses
 * @returns Object mapping bus names to their stats
 */
export function getAllBusStats(): Record<string, any> {
  try {
    return BusRegistry.getAllStats()
  } catch (error) {
    throw wrapError(error, 'getAllBusStats')
  }
}

/**
 * Gets registry information and health status
 * @returns Registry information
 */
export function getRegistryInfo(): object {
  try {
    return BusRegistry.getRegistryInfo()
  } catch (error) {
    throw wrapError(error, 'getRegistryInfo')
  }
}

/**
 * Performs cleanup operations on the registry
 */
export function cleanup(): void {
  try {
    BusRegistry.cleanup()
  } catch (error) {
    throw wrapError(error, 'cleanup')
  }
}

// ===== Built-in Plugins Export =====

/**
 * Collection of built-in plugins for common use cases
 */
export const Plugins = {
  Logger: class LoggerPlugin implements BusPlugin {
    name = 'logger'
    
    constructor(public options: { 
      logEmits?: boolean
      logRequests?: boolean 
      logResponses?: boolean
      prefix?: string
    } = {}) {}

    install(bus: any): void {
      const { logEmits = true, logRequests = true, logResponses = true, prefix = '[connectic]' } = this.options
      
      if (logEmits) {
        bus.addHook('beforeEmit', (event: string, payload: any) => {
          console.log(`${prefix} EMIT ${event}:`, payload)
        })
      }
      
      if (logRequests) {
        bus.interceptRequest((event: string, payload: any) => {
          console.log(`${prefix} REQUEST ${event}:`, payload)
          return payload
        })
      }
      
      if (logResponses) {
        bus.interceptResponse((event: string, response: any) => {
          console.log(`${prefix} RESPONSE ${event}:`, response)
          return response
        })
      }
    }
  },

  Validator: class ValidatorPlugin implements BusPlugin {
    name = 'validator'
    
    constructor(public schemas: Record<string, (payload: any) => boolean | string>) {}

    install(bus: any): void {
      bus.interceptRequest((event: string, payload: any) => {
        const validator = this.schemas[event]
        if (validator) {
          const result = validator(payload)
          if (result !== true) {
            const message = typeof result === 'string' ? result : 'Validation failed'
            throw new BusError(message, 422, { event, payload })
          }
        }
        return payload
      })
    }
  },

  RateLimit: class RateLimitPlugin implements BusPlugin {
    name = 'rateLimit'
    public requests = new Map<string, number[]>()
    
    constructor(public limit: number, public windowMs: number) {}

    install(bus: any): void {
      bus.interceptRequest((event: string, payload: any) => {
        const now = Date.now()
        const windowStart = now - this.windowMs
        
        const eventRequests = this.requests.get(event) || []
        const recentRequests = eventRequests.filter(time => time > windowStart)
        
        if (recentRequests.length >= this.limit) {
          throw new BusError(`Rate limit exceeded for ${event}`, 429, { limit: this.limit })
        }
        
        recentRequests.push(now)
        this.requests.set(event, recentRequests)
        
        return payload
      })
    }
  }
}

// ===== Re-exports =====

// Export types
export type { 
  BusConfig,
  BusPlugin,
  BusStats,
  SharedState,
  ComputedState,
  RequestOptions,
  RequestManyOptions,
  BatchRequest,
  CacheConfig,
  CacheStrategy,
  CacheOptions,
  HookType,
  HookHandler,
  MiddlewareFunction,
  RequestInterceptor,
  ResponseInterceptor,
  EventMap,
  RequestMap,
  MFEBus as IMFEBus
} from './types'

// Export errors
export { 
  BusError, 
  BusErrorCode, 
  BusErrorFactory,
  isBusError,
  hasBusErrorCode,
  wrapError,
  ErrorMessages
} from './errors'

// Export utility classes
export { 
  BuiltinMiddleware,
  BuiltinInterceptors,
  InterceptorUtils,
  SharedStateUtils,
  ComputedStateUtils,
  CacheUtils,
  RequestResponseUtils
} from './core'

// Default export for convenience
export default {
  createBus,
  getBus,
  getOrCreateBus,
  removeBus,
  clearAllBuses,
  listBuses,
  getAllBusStats,
  getRegistryInfo,
  cleanup,
  BusError,
  BusErrorCode,
  BusErrorFactory,
  Plugins
}

/**
 * Version information
 */
export const VERSION = '1.0.0'

/**
 * Library metadata
 */
export const META = {
  name: 'connectic',
  version: VERSION,
  description: 'Framework-agnostic communication library for microfrontends and complex applications',
  author: 'Your Name',
  license: 'MIT',
  repository: 'https://github.com/yourusername/connectic',
  keywords: ['microfrontend', 'communication', 'event-bus', 'state-management', 'typescript']
} as const