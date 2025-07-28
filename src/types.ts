
/**
 * connectic - Core Type Definitions
 * 
 * This file contains all the core interfaces and types used throughout connectic.
 * These types define the public API contracts and internal structure of the library.
 */


/**
 * Error types for validation and operations
 */
export type ConnecticError = string | Error;

/**
 * Configuration for creating a bus instance
 */
export interface BusConfig {
  /** Unique identifier for the bus instance */
  name: string
  /** Enable debug logging for development */
  debug?: boolean
  /** Default caching configuration */
  cache?: CacheConfig
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Default TTL for cached items in milliseconds */
  defaultTtl?: number
  /** Maximum number of items to store in cache */
  maxSize?: number
  /** Default caching strategy */
  strategy?: CacheStrategy
}

/**
 * Available caching strategies
 */
export type CacheStrategy = 
  | 'cache-first'           // Return cached data immediately if available
  | 'network-first'         // Try network first, fallback to cache
  | 'stale-while-revalidate' // Return cache, update in background
  | 'cache-only'            // Never go to network

/**
 * Cache options for individual requests
 */
export interface CacheOptions {
  /** Time to live for this specific cache entry */
  ttl?: number
  /** Custom cache key (defaults to event + payload hash) */
  key?: string
  /** Caching strategy for this request */
  strategy?: CacheStrategy
}

/**
 * Options for request/response communication
 */
export interface RequestOptions {
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number
  /** Number of retry attempts on failure (default: 0) */
  retries?: number
  /** Request priority for ordering */
  priority?: 'low' | 'normal' | 'high'
  /** Caching configuration for this request */
  cache?: CacheOptions
  /** AbortSignal for request cancellation */
  signal?: AbortSignal
}

/**
 * Options for collecting multiple responses
 */
export interface RequestManyOptions extends RequestOptions {
  /** Minimum number of responses before resolving */
  minResponses?: number
  /** Maximum number of responses to collect */
  maxResponses?: number
}

/**
 * Format for batch request arrays
 * [eventName, payload?, options?]
 */
export type BatchRequest = [string, any?, RequestOptions?]

/**
 * Plugin interface for extending bus functionality
 */
export interface BusPlugin<T extends Record<string, any> = any> {
  /** Unique plugin name */
  name: string
  /** Called when plugin is installed on a bus */
  install(bus: MFEBus<T>): void
  /** Called when plugin is removed (optional) */
  uninstall?(bus: MFEBus<T>): void
}

/**
 * Available lifecycle hook types
 */
export type HookType = 
  | 'beforeEmit'    // Before event is emitted
  | 'afterEmit'     // After event is emitted
  | 'beforeOn'      // Before event listener is added
  | 'afterOn'       // After event listener is added

/**
 * Hook handler function signature
 */
export type HookHandler = (event: string, payload?: any) => void

/**
 * Reactive shared state interface
 */
export interface SharedState<T> {
  /** Get current state value */
  get(): T
  /** Set new state value and notify subscribers */
  set(value: T): void
  /** Subscribe to state changes */
  subscribe(callback: (value: T) => void): () => void
  /** Clean up and destroy state */
  destroy(): void
}

/**
 * Computed/derived state interface
 */
export interface ComputedState<T> {
  /** Get current computed value */
  get(): T
  /** Subscribe to computed value changes */
  subscribe(callback: (value: T) => void): () => void
  /** Clean up and destroy computed state */
  destroy(): void
}

/**
 * Function for intercepting and transforming requests
 */
export type RequestInterceptor = (event: string, payload: any) => any

/**
 * Function for intercepting and transforming responses
 */
export type ResponseInterceptor = (event: string, response: any) => any

/**
 * Bus statistics and metrics
 */
export interface BusStats {
  /** Total number of events emitted */
  totalEvents: number
  /** Total number of requests made */
  totalRequests: number
  /** Current number of active listeners */
  activeListeners: number
  /** Current cache size */
  cacheSize: number
  /** Approximate memory usage in bytes */
  memoryUsage: number
}

/**
 * Middleware function for responder chains
 */
export type MiddlewareFunction = (
  payload: any,
  next: () => void,
  cancel: (reason?: string) => void
) => void | Promise<void>

/**
 * Builder interface for setting up responders with middleware
 */
export interface ResponderBuilder<K> {
  /** Add middleware to the responder chain */
  use(middleware: MiddlewareFunction): ResponderBuilder<K>
  /** Set the final handler function */
  handler(handlerFn: (payload: any) => any | Promise<any>): void
  /** Destroy the responder and clean up event listeners */
  destroy?(): void
}

/**
 * Cache management interface
 */
export interface CacheManager {
  /** Get value from cache */
  get(key: string): any
  /** Set value in cache with optional TTL */
  set(key: string, value: any, ttl?: number): void
  /** Remove specific cache entry */
  invalidate(key: string): boolean
  /** Remove cache entries matching pattern */
  invalidatePattern(pattern: string): number
  /** Clear entire cache */
  clear(): void
}

/**
 * Main bus interface combining all functionality
 */
export interface MFEBus<
  TEventMap extends Record<string, any> = {},
  TRequestMap extends Record<string, any> = {}
> {
  // ===== Event Communication =====
  
  /** Emit an event to all subscribers */
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void
  
  /** Subscribe to an event */
  on<K extends keyof TEventMap>(
    event: K, 
    handler: (payload: TEventMap[K]) => void
  ): () => void
  
  /** Subscribe to an event for one-time execution */
  once<K extends keyof TEventMap>(
    event: K, 
    handler: (payload: TEventMap[K]) => void
  ): () => void
  
  /** Remove specific event handler */
  off<K extends keyof TEventMap>(event: K, handler: Function): void
  
  /** Remove all listeners for an event */
  removeAllListeners<K extends keyof TEventMap>(event?: K): void

  // ===== Request/Response Communication =====
  
  /** Make an async request and wait for response */
  request<K extends keyof TRequestMap>(
    event: K,
    payload?: TRequestMap[K] extends { request: infer R } ? R : any,
    options?: RequestOptions
  ): Promise<TRequestMap[K] extends { response: infer R } ? R : any>
  
  /** Collect multiple responses within timeout window */
  requestMany<K extends keyof TRequestMap>(
    event: K,
    payload?: TRequestMap[K] extends { request: infer R } ? R : any,
    options?: RequestManyOptions
  ): Promise<Array<TRequestMap[K] extends { response: infer R } ? R : any>>
  
  /** Execute multiple requests in parallel */
  requestBatch(requests: BatchRequest[]): Promise<any[]>
  
  /** Set up a responder for handling requests */
  respond<K extends keyof TRequestMap>(event: K): ResponderBuilder<K>

  // ===== State Management =====
  
  /** Create reactive shared state */
  createState<T>(key: string, initialValue: T): SharedState<T>
  
  /** Create computed/derived state */
  createComputed<T>(computeFn: () => T): ComputedState<T>
  
  /** Set state value directly */
  setState<K extends keyof TEventMap>(key: K, value: TEventMap[K]): void
  
  /** Get current state value */
  getState<K extends keyof TEventMap>(key: K): TEventMap[K] | undefined
  
  /** Remove state */
  removeState<K extends keyof TEventMap>(key: K): void

  // ===== Plugin System =====
  
  /** Add a plugin to extend functionality */
  use(plugin: BusPlugin): this
  
  /** Add a lifecycle hook */
  addHook(type: HookType, handler: HookHandler): void
  
  /** Remove a lifecycle hook */
  removeHook(type: HookType, handler: HookHandler): void

  // ===== Namespacing =====
  
  /** Create a namespaced bus instance */
  namespace(name: string): MFEBus<TEventMap, TRequestMap>

  // ===== Cache Management =====
  
  /** Cache management interface */
  cache: CacheManager

  // ===== Interception =====
  
  /** Intercept and transform outgoing requests */
  interceptRequest(interceptor: RequestInterceptor): void
  
  /** Intercept and transform incoming responses */
  interceptResponse(interceptor: ResponseInterceptor): void

  // ===== Utilities =====
  
  /** Get number of listeners for an event */
  getListenerCount<K extends keyof TEventMap>(event: K): number
  
  /** Check if event has any listeners */
  hasListeners<K extends keyof TEventMap>(event: K): boolean
  
  /** Get bus statistics and metrics */
  getStats(): BusStats
  
  /** Clean up and destroy bus instance */
  destroy(): void
}

/**
 * Internal cache entry structure
 */
export interface CacheEntry {
  /** Cached value */
  value: any
  /** Expiration timestamp */
  expiry: number
  /** Last accessed timestamp for LRU */
  lastAccessed: number
}

/**
 * Internal pending request structure
 */
export interface PendingRequest {
  /** Promise resolve function */
  resolve: (value: any) => void
  /** Promise reject function */
  reject: (reason?: any) => void
  /** Timeout handle */
  timeout: NodeJS.Timeout
  /** Request options */
  options: RequestOptions
}

/**
 * Event map type constraint
 */
export type EventMap = Record<string, any>

/**
 * Request map type constraint - each key maps to {request, response} pair
 */
export type RequestMap = Record<string, { request?: any; response?: any }>

/**
 * Utility type to extract request payload type
 */
export type ExtractRequest<T> = T extends { request: infer R } ? R : any

/**
 * Utility type to extract response payload type
 */
export type ExtractResponse<T> = T extends { response: infer R } ? R : any

/**
 * Type-safe event emission helper
 */
export type TypedEmit<T extends EventMap> = <K extends keyof T>(
  event: K,
  payload: T[K]
) => void

/**
 * Type-safe event subscription helper
 */
export type TypedOn<T extends EventMap> = <K extends keyof T>(
  event: K,
  handler: (payload: T[K]) => void
) => () => void

/**
 * Type-safe request helper
 */
export type TypedRequest<T extends RequestMap> = <K extends keyof T>(
  event: K,
  payload?: ExtractRequest<T[K]>,
  options?: RequestOptions
) => Promise<ExtractResponse<T[K]>>

/**
 * Global registry store type
 */
export type GlobalStore = Map<string, any>