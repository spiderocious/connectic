# connectic Core Implementation Overview

## Shortcode Definitions
- `e` = export
- `ed` = export default
- `i` = interface
- `t` = type
- `c` = class
- `f` = function
- `m` = method
- `p` = property
- `g` = getter
- `s` = setter
- `a` = async
- `r` = returns
- `v` = void
- `n` = number
- `s` = string
- `b` = boolean
- `o` = object
- `ar` = array
- `opt` = optional
- `pr` = private
- `pub` = public
- `st` = static
- `ro` = readonly
- `gen` = generic

## src/types.ts

```typescript
// Core configuration
e i BusConfig {
  name: s
  debug?: b
  cache?: CacheConfig
}

// Cache configuration
e i CacheConfig {
  defaultTtl?: n
  maxSize?: n
  strategy?: CacheStrategy
}

e t CacheStrategy = 'cache-first' | 'network-first' | 'stale-while-revalidate' | 'cache-only'

e i CacheOptions {
  ttl?: n
  key?: s
  strategy?: CacheStrategy
}

// Request options
e i RequestOptions {
  timeout?: n
  retries?: n
  priority?: 'low' | 'normal' | 'high'
  cache?: CacheOptions
  signal?: AbortSignal
}

e i RequestManyOptions extends RequestOptions {
  minResponses?: n
  maxResponses?: n
}

// Batch requests
e t BatchRequest = [s, any?, RequestOptions?]

// Plugin system
e i BusPlugin<T = any> {
  name: s
  install: f(bus: MFEBus<T>) r v
  uninstall?: f(bus: MFEBus<T>) r v
}

// Hook types
e t HookType = 'beforeEmit' | 'afterEmit' | 'beforeOn' | 'afterOn'
e t HookHandler = f(event: s, payload?: any) r v

// State interfaces
e i SharedState<T> {
  get: f() r T
  set: f(value: T) r v
  subscribe: f(callback: f(value: T) r v) r f() r v
  destroy: f() r v
}

e i ComputedState<T> {
  get: f() r T
  subscribe: f(callback: f(value: T) r v) r f() r v
  destroy: f() r v
}

// Interceptor types
e t RequestInterceptor = f(event: s, payload: any) r any
e t ResponseInterceptor = f(event: s, response: any) r any

// Bus statistics
e i BusStats {
  totalEvents: n
  totalRequests: n
  activeListeners: n
  cacheSize: n
  memoryUsage: n
}

// Main bus interface
e i MFEBus<TEventMap extends Record<s, any> = {}, TRequestMap extends Record<s, any> = {}> {
  // Event methods
  emit: f<K extends keyof TEventMap>(event: K, payload: TEventMap[K]) r v
  on: f<K extends keyof TEventMap>(event: K, handler: f(payload: TEventMap[K]) r v) r f() r v
  once: f<K extends keyof TEventMap>(event: K, handler: f(payload: TEventMap[K]) r v) r f() r v
  off: f<K extends keyof TEventMap>(event: K, handler: Function) r v
  removeAllListeners: f<K extends keyof TEventMap>(event?: K) r v
  
  // Request/response methods
  request: f<K extends keyof TRequestMap>(event: K, payload?: TRequestMap[K]['request'], options?: RequestOptions) r Promise<TRequestMap[K]['response']>
  requestMany: f<K extends keyof TRequestMap>(event: K, payload?: TRequestMap[K]['request'], options?: RequestManyOptions) r Promise<TRequestMap[K]['response'][]>
  requestBatch: f(requests: BatchRequest[]) r Promise<any[]>
  respond: f<K extends keyof TRequestMap>(event: K) r ResponderBuilder<K>
  
  // State methods
  createState: f<T>(key: s, initialValue: T) r SharedState<T>
  createComputed: f<T>(computeFn: f() r T) r ComputedState<T>
  setState: f<K extends keyof TEventMap>(key: K, value: TEventMap[K]) r v
  getState: f<K extends keyof TEventMap>(key: K) r TEventMap[K] | undefined
  removeState: f<K extends keyof TEventMap>(key: K) r v
  
  // Plugin methods
  use: f(plugin: BusPlugin) r this
  addHook: f(type: HookType, handler: HookHandler) r v
  removeHook: f(type: HookType, handler: HookHandler) r v
  
  // Namespace methods
  namespace: f(name: s) r MFEBus<TEventMap, TRequestMap>
  
  // Cache methods
  cache: {
    get: f(key: s) r any
    set: f(key: s, value: any, ttl?: n) r v
    invalidate: f(key: s) r b
    invalidatePattern: f(pattern: s) r n
    clear: f() r v
  }
  
  // Interceptor methods
  interceptRequest: f(interceptor: RequestInterceptor) r v
  interceptResponse: f(interceptor: ResponseInterceptor) r v
  
  // Utility methods
  getListenerCount: f<K extends keyof TEventMap>(event: K) r n
  hasListeners: f<K extends keyof TEventMap>(event: K) r b
  getStats: f() r BusStats
  destroy: f() r v
}

// Responder builder
e i ResponderBuilder<K> {
  use: f(middleware: MiddlewareFunction) r ResponderBuilder<K>
  handler: f(handlerFn: f(payload: any) r any | Promise<any>) r v
}

// Middleware function type
e t MiddlewareFunction = f(payload: any, next: f() r v, cancel: f(reason?: s) r v) r v | Promise<v>
```

## src/error/errors.ts

```typescript
// Legacy error class
e c ConnecticError extends Error {
  pub ro code: n | s = 500
  constructor(message: s)
}

e f createError(message: s) r ConnecticError

// Bus error codes
e enum BusErrorCode {
  NOT_FOUND = 404,
  FORBIDDEN = 403,
  TIMEOUT = 408,
  CONFLICT = 409,
  PAYLOAD_TOO_LARGE = 413,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_ERROR = 500,
  BAD_REQUEST = 400,
  GONE = 410,
  SERVICE_UNAVAILABLE = 503,
  UNPROCESSABLE_ENTITY = 422
}

// Main bus error class
e c BusError extends Error {
  constructor(message: s, pub ro busCode: BusErrorCode, pub ro details?: any)
  toJSON() r o
  toString() r s
  isRetryable() r b
  isClientError() r b
  isServerError() r b
}

// Error factory
e c BusErrorFactory {
  st notFound(event: s, details?: any) r BusError
  st timeout(event: s, timeoutMs: n, details?: any) r BusError
  st forbidden(event: s, reason: s, details?: any) r BusError
  st conflict(event: s, responderCount: n, details?: any) r BusError
  st payloadTooLarge(event: s, size: n, limit: n, details?: any) r BusError
  st tooManyRequests(event: s, limit: n, window: n, details?: any) r BusError
  st internal(message: s, originalError?: Error, details?: any) r BusError
  st badRequest(event: s, reason: s, details?: any) r BusError
  st gone(event: s, details?: any) r BusError
  st serviceUnavailable(event: s, retryAfter?: n, details?: any) r BusError
  st unprocessableEntity(event: s, reason: s, details?: any) r BusError
}

// Type guards and utilities
e f isBusError(error: any) r error is BusError
e f hasBusErrorCode(error: any, code: BusErrorCode) r error is BusError
e f wrapError(error: unknown, event?: s) r BusError
e f createValidationError(field: s, value: any, expected: s) r BusError

// Error message constants
e const ErrorMessages: {
  INVALID_EVENT_NAME: s
  INVALID_PAYLOAD: s
  INVALID_HANDLER: s
  INVALID_TIMEOUT: s
  INVALID_RETRIES: s
  BUS_DESTROYED: s
  MIDDLEWARE_ERROR: s
  CACHE_ERROR: s
  STATE_NOT_FOUND: s
  COMPUTED_CIRCULAR_DEPENDENCY: s
}
```

## src/core/utils.ts

```typescript
// Core utilities
e f generateId(length: n = 16) r s
e f isValidEventName(name: any) r name is s
e f isValidTimeout(timeout: any) r timeout is n
e f isValidRetries(retries: any) r retries is n
e f isValidHandler(handler: any) r handler is Function
e f isSerializable(payload: any) r b

// Function utilities
e f debounce<T extends (...args: any[]) => any>(func: T, wait: n) r T
e f throttle<T extends (...args: any[]) => any>(func: T, limit: n) r T

// Object utilities
e f deepClone<T>(obj: T) r T
e f estimateObjectSize(obj: any) r n
e f cleanupMemoryReferences(obj: any) r v

// Global storage
e f getGlobalStore() r Map<s, any>

// Safe execution
e f safeExecute<T>(fn: f() r T, context: s, fallbackValue?: T) r T | undefined
e f safeExecuteAsync<T>(fn: f() r Promise<T>, context: s, fallbackValue?: T) r Promise<T | undefined>

// Validation and parameters
e f validateParameters(event: any, handler?: any, timeout?: any, retries?: any) r v

// Async utilities
e f delay(ms: n) r Promise<v>
e f exponentialBackoff(attempt: n, baseDelay?: n, maxDelay?: n) r n

// Hashing and cache
e f hashString(str: s) r n
e f createCacheKey(event: s, payload?: any) r s

// Environment detection
e f isBrowser() r b
e f isNode() r b
e f isWebWorker() r b
```

## src/core/event-bus.ts

```typescript
e c EventBus {
  pr listeners: Map<s, Set<Function>>
  pr stats: { totalEvents: n, totalSubscriptions: n, totalUnsubscriptions: n, errorCount: n }
  pr isDestroyed: b
  pr maxListeners: n = 100  // Memory leak prevention
  
  // Core pub/sub methods (with error isolation and validation)
  emit(event: s, payload: any) r v  // Uses safeExecute for handler isolation
  on(event: s, handler: Function) r f() r v  // Enforces maxListeners limit
  once(event: s, handler: Function) r f() r v  // Auto-cleanup after execution
  off(event: s, handler: Function) r v  // Auto-removes empty event sets
  removeAllListeners(event?: s) r v  // Batch cleanup with stats tracking
  
  // Query methods (with validation)
  getListenerCount(event: s) r n  // Parameter validation via validateParameters
  hasListeners(event: s) r b  // Parameter validation via validateParameters
  getEventNames() r s[]  // Returns active event names only
  
  // Statistics and configuration (enterprise-grade monitoring)
  getStats() r BusStats  // Includes memory usage estimation
  getDetailedStats() r o  // Extended stats with error rates and limits
  setMaxListeners(max: n) r v  // Runtime configuration with validation
  getMaxListeners() r n  // Current limit getter
  
  // Lifecycle methods (robust state management)
  isDestroyedState() r b  // State checker
  destroy() r v  // Complete resource cleanup with stats reset
  
  // Namespace support (filtered event views)
  createNamespace(namespace: s) r NamespacedEventBus  // Creates isolated view
  
  // Internal methods (production-grade error handling)
  pr throwIfDestroyed() r v  // Consistent destroyed state checking
  // All methods wrapped with comprehensive error handling via wrapError()
  // Memory leak prevention through automatic cleanup of empty event sets
  // Performance monitoring via estimateObjectSize for memory usage tracking
}

e c NamespacedEventBus {
  constructor(pr eventBus: EventBus, pr namespace: s)
  
  // Namespaced wrappers (automatic prefixing with ${namespace}:${event})
  emit(event: s, payload: any) r v
  on(event: s, handler: Function) r f() r v
  once(event: s, handler: Function) r f() r v
  off(event: s, handler: Function) r v
  removeAllListeners(event?: s) r v  // Can clear all namespace events
  getListenerCount(event: s) r n
  hasListeners(event: s) r b
  getEventNames() r s[]  // Returns events without namespace prefix
  getNamespace() r s  // Returns current namespace
  destroy() r v  // Removes all listeners in this namespace
  
  // Note: Sub-namespacing capability exists but currently commented out
  // namespace(subNamespace: s) r NamespacedEventBus (future feature)
}

// Production Features Summary:
// - Memory leak prevention with maxListeners enforcement
// - Error isolation using safeExecute to prevent handler failures from affecting others
// - Comprehensive parameter validation throughout all methods
// - Advanced statistics including memory usage estimation
// - Automatic cleanup of empty event sets to prevent memory bloat
// - Robust error handling with wrapError for consistent error reporting
// - Resource management with proper cleanup in destroy operations
// - Performance monitoring capabilities for enterprise deployments
```

## src/core/registry.ts

```typescript
e c BusRegistry {
  pr st instances: Map<s, MFEBus<any>>
  pr st fallbackStore: Map<s, any>
  
  st create<T extends Record<s, any>>(config: BusConfig) r MFEBus<T>
  st get<T extends Record<s, any>>(name: s) r MFEBus<T> | null
  st has(name: s) r b
  st remove(name: s) r b
  st clear() r v
  st getAll() r s[]
  pr st getGlobalStore() r Map<s, any>
}
```

## src/core/middleware.ts

```typescript
e c MiddlewareManager {
  pr hooks: Record<HookType, HookHandler[]>
  pr plugins: BusPlugin[]
  
  addPlugin(plugin: BusPlugin) r v
  removePlugin(pluginName: s) r b
  addHook(type: HookType, handler: HookHandler) r v
  removeHook(type: HookType, handler: HookHandler) r v
  runHooks(type: HookType, event: s, payload?: any) r v
  destroy() r v
}

e c ResponderBuilder<K> {
  pr middlewares: MiddlewareFunction[]
  pr eventName: s
  pr bus: EventBus
  
  use(middleware: MiddlewareFunction) r ResponderBuilder<K>
  handler(handlerFn: f(payload: any) r any | Promise<any>) r v
  pr executeMiddleware(payload: any) r Promise<any>
}
```

## src/core/shared-state.ts

```typescript
e c SharedStateManager {
  pr states: Map<s, SharedState<any>>
  pr bus: EventBus
  
  createState<T>(key: s, initialValue: T) r SharedState<T>
  getState<T>(key: s) r T | undefined
  setState<T>(key: s, value: T) r v
  removeState(key: s) r v
  destroy() r v
}

e c SharedStateImpl<T> implements SharedState<T> {
  pr value: T
  pr subscribers: Set<f(value: T) r v>
  pr key: s
  pr bus: EventBus
  
  constructor(key: s, initialValue: T, bus: EventBus)
  get() r T
  set(value: T) r v
  subscribe(callback: f(value: T) r v) r f() r v
  destroy() r v
  pr notifySubscribers() r v
}
```

## src/core/computed-state.ts

```typescript
e c ComputedStateManager {
  pr computedStates: Set<ComputedStateImpl<any>>
  pr stateManager: SharedStateManager
  
  createComputed<T>(computeFn: f() r T) r ComputedState<T>
  destroy() r v
}

e c ComputedStateImpl<T> implements ComputedState<T> {
  pr computeFn: f() r T
  pr cachedValue: T | undefined
  pr isStale: b
  pr dependencies: Set<SharedState<any>>
  pr subscribers: Set<f(value: T) r v>
  pr stateManager: SharedStateManager
  
  constructor(computeFn: f() r T, stateManager: SharedStateManager)
  get() r T
  subscribe(callback: f(value: T) r v) r f() r v
  destroy() r v
  pr trackDependencies() r T
  pr invalidate() r v
  pr notifySubscribers() r v
}
```

## src/core/cache.ts

```typescript
e c CacheManager {
  pr cache: Map<s, CacheEntry>
  pr config: CacheConfig
  pr cleanupTimer: NodeJS.Timeout | undefined
  
  constructor(config: CacheConfig)
  get(key: s) r any
  set(key: s, value: any, ttl?: n) r v
  invalidate(key: s) r b
  invalidatePattern(pattern: s) r n
  clear() r v
  getSize() r n
  pr cleanup() r v
  pr startCleanupTimer() r v
  pr stopCleanupTimer() r v
  destroy() r v
}

i CacheEntry {
  value: any
  expiry: n
  lastAccessed: n
}
```

## src/core/request-response.ts

```typescript
e c RequestResponseManager {
  pr bus: EventBus
  pr cache: CacheManager
  pr pendingRequests: Map<s, PendingRequest>
  pr responders: Map<s, ResponderBuilder<any>>
  pr interceptors: { request: RequestInterceptor[], response: ResponseInterceptor[] }
  
  constructor(bus: EventBus, cache: CacheManager)
  a request<T>(event: s, payload?: any, options?: RequestOptions) r Promise<T>
  a requestMany<T>(event: s, payload?: any, options?: RequestManyOptions) r Promise<T[]>
  a requestBatch(requests: BatchRequest[]) r Promise<any[]>
  respond<K>(event: s) r ResponderBuilder<K>
  interceptRequest(interceptor: RequestInterceptor) r v
  interceptResponse(interceptor: ResponseInterceptor) r v
  pr handleRequest(event: s, payload: any, correlationId: s) r Promise<v>
  pr applyRequestInterceptors(event: s, payload: any) r any
  pr applyResponseInterceptors(event: s, response: any) r any
  destroy() r v
}

i PendingRequest {
  resolve: f(value: any) r v
  reject: f(reason?: any) r v
  timeout: NodeJS.Timeout
  options: RequestOptions
}
```

## src/core/interceptors.ts

```typescript
e c InterceptorManager {
  pr requestInterceptors: RequestInterceptor[]
  pr responseInterceptors: ResponseInterceptor[]
  
  addRequestInterceptor(interceptor: RequestInterceptor) r v
  addResponseInterceptor(interceptor: ResponseInterceptor) r v
  removeRequestInterceptor(interceptor: RequestInterceptor) r v
  removeResponseInterceptor(interceptor: ResponseInterceptor) r v
  applyRequestInterceptors(event: s, payload: any) r any
  applyResponseInterceptors(event: s, response: any) r any
  clear() r v
}
```

## src/core/index.ts

```typescript
e { EventBus } from './event-bus'
e { BusRegistry } from './registry'
e { MiddlewareManager, ResponderBuilder } from './middleware'
e { SharedStateManager, SharedStateImpl } from './shared-state'
e { ComputedStateManager, ComputedStateImpl } from './computed-state'
e { CacheManager } from './cache'
e { RequestResponseManager } from './request-response'
e { InterceptorManager } from './interceptors'
e * from './utils'
```

## src/index.ts

```typescript
// Main bus class combining all managers
e c MFEBus<TEventMap extends Record<s, any> = {}, TRequestMap extends Record<s, any> = {}> implements MFEBus<TEventMap, TRequestMap> {
  pr eventBus: EventBus
  pr middleware: MiddlewareManager
  pr stateManager: SharedStateManager
  pr computedManager: ComputedStateManager
  pr cacheManager: CacheManager
  pr requestManager: RequestResponseManager
  pr interceptorManager: InterceptorManager
  pr config: BusConfig
  pr namespacePath: s
  
  constructor(config: BusConfig, namespacePath: s = '')
  
  // All interface methods implemented
  emit, on, once, off, removeAllListeners,
  request, requestMany, requestBatch, respond,
  createState, createComputed, setState, getState, removeState,
  use, addHook, removeHook, namespace,
  cache: { get, set, invalidate, invalidatePattern, clear },
  interceptRequest, interceptResponse,
  getListenerCount, hasListeners, getStats, destroy
}

// Factory functions
e f createBus<TEventMap extends Record<s, any> = {}, TRequestMap extends Record<s, any> = {}>(config: BusConfig) r MFEBus<TEventMap, TRequestMap>
e f getBus<TEventMap extends Record<s, any> = {}, TRequestMap extends Record<s, any> = {}>(name: s) r MFEBus<TEventMap, TRequestMap> | null
e f getOrCreateBus<TEventMap extends Record<s, any> = {}, TRequestMap extends Record<s, any> = {}>(config: BusConfig) r MFEBus<TEventMap, TRequestMap>
e f removeBus(name: s) r b
e f clearAllBuses() r v
e f listBuses() r s[]

// Re-exports
e { BusError, BusErrorCode } from './errors'
e * from './types'
```

## Test Structure Overview

```typescript
// __tests__/event-bus.test.ts
describe('EventBus', () => {
  'should emit and receive events'
  'should handle multiple subscribers'
  'should unsubscribe correctly'
  'should handle once() events'
  'should prevent memory leaks'
  'should isolate handler errors'
})

// __tests__/request-response.test.ts  
describe('RequestResponse', () => {
  'should handle basic request/response'
  'should timeout requests'
  'should handle multiple responders'
  'should cache responses'
  'should handle middleware in responders'
  'should batch requests'
})

// __tests__/shared-state.test.ts
describe('SharedState', () => {
  'should create and manage state'
  'should notify subscribers'
  'should sync across bus instances'
  'should handle computed state'
  'should track dependencies'
})

// __tests__/integration.test.ts
describe('Integration', () => {
  'should work across multiple bus instances'
  'should handle complex workflows'
  'should manage memory properly'
  'should handle errors gracefully'
})
```
