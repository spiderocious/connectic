# connectic API Reference

Complete reference for all methods and properties available in connectic v1.0.0

## Core Bus Creation & Management

### `createBus<T>(config: BusConfig): MFEBus<T>`
Creates a new bus instance with the specified configuration.

```typescript
interface BusConfig {
  name: string                    // Unique bus identifier
  debug?: boolean                 // Enable debug logging
  cache?: CacheConfig            // Default caching configuration
}

const bus = createBus<MyEventMap>({
  name: 'my-app',
  debug: true,
  cache: { defaultTtl: 300000 }
})
```

### `getBus<T>(name: string): MFEBus<T> | null`
Retrieves an existing bus instance by name.

```typescript
const existingBus = getBus<MyEventMap>('my-app')
if (existingBus) {
  // Use existing bus
}
```

### `getOrCreateBus<T>(config: BusConfig): MFEBus<T>`
Gets existing bus or creates new one if it doesn't exist.

```typescript
const bus = getOrCreateBus<MyEventMap>({ name: 'my-app' })
```

### `removeBus(name: string): boolean`
Destroys and removes a bus instance.

```typescript
const removed = removeBus('my-app') // Returns true if bus was removed
```

### `clearAllBuses(): void`
Destroys all bus instances and clears registry.

```typescript
clearAllBuses() // Clean slate
```

### `listBuses(): string[]`
Returns array of all registered bus names.

```typescript
const busNames = listBuses() // ['my-app', 'another-app']
```

## Event Communication

### Pub/Sub Events

#### `emit<K extends keyof T>(event: K, payload: T[K]): void`
Emits an event with payload to all subscribers.

```typescript
bus.emit('user:login', { userId: '123', email: 'user@example.com' })
bus.emit('cart:updated', { items: [], total: 0 })
```

#### `on<K extends keyof T>(event: K, handler: (payload: T[K]) => void): () => void`
Subscribes to an event. Returns unsubscribe function.

```typescript
const unsubscribe = bus.on('user:login', (user) => {
  console.log('User logged in:', user.email)
})

// Later: unsubscribe()
```

#### `once<K extends keyof T>(event: K, handler: (payload: T[K]) => void): () => void`
Subscribes to an event for one-time execution only.

```typescript
bus.once('app:initialized', () => {
  console.log('App is ready!')
})
```

#### `off<K extends keyof T>(event: K, handler: Function): void`
Removes specific event handler.

```typescript
const handler = (data) => console.log(data)
bus.on('test:event', handler)
bus.off('test:event', handler) // Remove specific handler
```

#### `removeAllListeners<K extends keyof T>(event?: K): void`
Removes all listeners for an event, or all listeners if no event specified.

```typescript
bus.removeAllListeners('user:login') // Remove all listeners for this event
bus.removeAllListeners() // Remove all listeners for all events
```

### Request/Response Communication

#### `request<K extends keyof RequestMap>(event: K, payload?: RequestMap[K]['request'], options?: RequestOptions): Promise<RequestMap[K]['response']>`
Makes an async request and waits for response.

```typescript
interface RequestOptions {
  timeout?: number              // Request timeout in ms (default: 10000)
  retries?: number             // Number of retry attempts (default: 0)
  priority?: 'low' | 'normal' | 'high'  // Request priority
  cache?: CacheOptions         // Caching configuration
  signal?: AbortSignal         // Cancellation signal
}

// Basic request
const user = await bus.request('get:user:profile', { userId: '123' })

// With options
const user = await bus.request('get:user:profile', { userId: '123' }, {
  timeout: 5000,
  retries: 2,
  cache: { ttl: 300000 }
})
```

#### `requestMany<K extends keyof RequestMap>(event: K, payload?: RequestMap[K]['request'], options?: RequestManyOptions): Promise<RequestMap[K]['response'][]>`
Collects multiple responses within timeout window.

```typescript
interface RequestManyOptions extends RequestOptions {
  minResponses?: number        // Minimum responses before resolving
  maxResponses?: number        // Maximum responses to collect
}

// Collect all responses within timeout
const allSessions = await bus.requestMany('get:all:user:sessions', { userId: '123' }, {
  timeout: 3000,
  minResponses: 1
})
```

#### `requestBatch(requests: BatchRequest[]): Promise<any[]>`
Executes multiple requests in parallel.

```typescript
type BatchRequest = [string, any?, RequestOptions?]

const [user, preferences, permissions] = await bus.requestBatch([
  ['get:user', { id: '123' }],
  ['get:preferences', { id: '123' }],
  ['get:permissions', { id: '123' }]
])
```

#### `respond<K extends keyof RequestMap>(event: K): ResponderBuilder<K>`
Sets up a responder for handling requests.

```typescript
// Simple responder
bus.respond('get:user:profile')
   .handler(async ({ userId }) => {
     return await fetchUser(userId)
   })

// With middleware
bus.respond('get:sensitive:data')
   .use(validateAuth)
   .use(validatePayload)
   .use(rateLimit)
   .handler(async (payload) => {
     return await getSensitiveData(payload)
   })
```

## Shared State Management

### `createState<T>(key: string, initialValue: T): SharedState<T>`
Creates a reactive shared state.

```typescript
interface SharedState<T> {
  get(): T
  set(value: T): void
  subscribe(callback: (value: T) => void): () => void
  destroy(): void
}

const cartState = bus.createState('cart', [])

// Get current value
const items = cartState.get()

// Update value (notifies all subscribers)
cartState.set([...items, newItem])

// Subscribe to changes
const unsubscribe = cartState.subscribe((items) => {
  updateCartUI(items)
})
```

### `createComputed<T>(computeFn: () => T): ComputedState<T>`
Creates derived state that automatically updates when dependencies change.

```typescript
interface ComputedState<T> {
  get(): T
  subscribe(callback: (value: T) => void): () => void
  destroy(): void
}

const cartTotal = bus.createComputed(() => {
  const items = cartState.get()
  return items.reduce((sum, item) => sum + item.price, 0)
})

// Access computed value
const total = cartTotal.get()

// Subscribe to computed changes
cartTotal.subscribe((total) => {
  updateTotalDisplay(total)
})
```

### Direct State Methods

#### `setState<K extends keyof T>(key: K, value: T[K]): void`
Sets state value and broadcasts change event.

```typescript
bus.setState('user:preferences', { theme: 'dark', language: 'en' })
```

#### `getState<K extends keyof T>(key: K): T[K] | undefined`
Gets current state value.

```typescript
const preferences = bus.getState('user:preferences')
```

#### `removeState<K extends keyof T>(key: K): void`
Removes state and emits removal event.

```typescript
bus.removeState('user:session') // Clears session state
```

## Middleware & Plugins

### `use(plugin: BusPlugin): this`
Adds a plugin to the bus instance.

```typescript
interface BusPlugin<T = any> {
  name: string
  install(bus: MFEBus<T>): void
  uninstall?(bus: MFEBus<T>): void
}

// Built-in plugins
bus.use(new LoggerPlugin({ logEmits: true, logSubscriptions: true }))
   .use(new ValidatorPlugin(validationSchemas))
   .use(new CachePlugin({ defaultTtl: 300000 }))
```

### `addHook(type: HookType, handler: HookHandler): void`
Adds a lifecycle hook.

```typescript
type HookType = 'beforeEmit' | 'afterEmit' | 'beforeOn' | 'afterOn'
type HookHandler = (event: string, payload?: any) => void

bus.addHook('beforeEmit', (event, payload) => {
  console.log(`About to emit ${event}:`, payload)
})
```

### `removeHook(type: HookType, handler: HookHandler): void`
Removes a specific lifecycle hook.

```typescript
bus.removeHook('beforeEmit', myHookHandler)
```

## Namespacing

### `namespace(name: string): NamespacedBus`
Creates a namespaced bus instance.

```typescript
const userBus = bus.namespace('user')
const cartBus = bus.namespace('cart')

userBus.emit('profile:updated', data) // Actually emits 'user:profile:updated'
cartBus.emit('items:changed', data)   // Actually emits 'cart:items:changed'

// Namespaced buses inherit all methods
const profile = await userBus.request('get:profile', { id: '123' })
```

## Caching

### Cache Configuration
```typescript
interface CacheOptions {
  ttl?: number                    // Time to live in milliseconds
  key?: string                   // Custom cache key
  strategy?: CacheStrategy       // Caching strategy
}

type CacheStrategy = 
  | 'cache-first'                // Return cached if available
  | 'network-first'              // Try network first, fallback to cache
  | 'stale-while-revalidate'     // Return cache, update in background
  | 'cache-only'                 // Never go to network
```

### Cache Management Methods

#### `cache.get(key: string): any`
Retrieves value from cache.

```typescript
const cachedUser = bus.cache.get('user-123')
```

#### `cache.set(key: string, value: any, ttl?: number): void`
Stores value in cache with optional TTL.

```typescript
bus.cache.set('user-123', userData, 300000) // Cache for 5 minutes
```

#### `cache.invalidate(key: string): boolean`
Removes specific cache entry.

```typescript
bus.cache.invalidate('user-123')
```

#### `cache.invalidatePattern(pattern: string): number`
Removes cache entries matching pattern.

```typescript
const removed = bus.cache.invalidatePattern('user-*') // Returns count removed
```

#### `cache.clear(): void`
Clears entire cache.

```typescript
bus.cache.clear()
```

## Interception

### `interceptRequest(interceptor: RequestInterceptor): void`
Intercepts and transforms outgoing requests.

```typescript
type RequestInterceptor = (event: string, payload: any) => any

bus.interceptRequest((event, payload) => {
  return {
    ...payload,
    timestamp: Date.now(),
    requestId: generateId()
  }
})
```

### `interceptResponse(interceptor: ResponseInterceptor): void`
Intercepts and transforms incoming responses.

```typescript
type ResponseInterceptor = (event: string, response: any) => any

bus.interceptResponse((event, response) => {
  return {
    data: response,
    cached: false,
    timestamp: Date.now()
  }
})
```

## Utility Methods

### `getListenerCount<K extends keyof T>(event: K): number`
Returns number of listeners for an event.

```typescript
const count = bus.getListenerCount('user:login') // Returns 3
```

### `hasListeners<K extends keyof T>(event: K): boolean`
Checks if event has any listeners.

```typescript
if (bus.hasListeners('user:login')) {
  bus.emit('user:login', userData)
}
```

### `getStats(): BusStats`
Returns bus statistics and metrics.

```typescript
interface BusStats {
  totalEvents: number
  totalRequests: number
  activeListeners: number
  cacheSize: number
  memoryUsage: number
}

const stats = bus.getStats()
console.log(`Bus has ${stats.activeListeners} active listeners`)
```

### `destroy(): void`
Cleans up bus instance and releases resources.

```typescript
bus.destroy() // Clean up all listeners, cache, and state
```

## Error Handling

### Error Types
```typescript
enum BusErrorCode {
  NOT_FOUND = 404,              // No responders for request
  FORBIDDEN = 403,              // Middleware validation failed
  TIMEOUT = 408,                // Request timed out
  CONFLICT = 409,               // Multiple responders when expecting one
  TOO_MANY_REQUESTS = 429,      // Rate limiting hit
  INTERNAL_ERROR = 500          // Bus internal error
}

class BusError extends Error {
  constructor(
    message: string,
    public busCode: BusErrorCode,
    public details?: any
  )
}
```

### Error Handling Patterns
```typescript
try {
  const result = await bus.request('get:user', { id: '123' })
} catch (error) {
  if (error instanceof BusError) {
    switch (error.busCode) {
      case BusErrorCode.NOT_FOUND:
        console.log('No service available to handle request')
        break
      case BusErrorCode.TIMEOUT:
        console.log('Request timed out, try again')
        break
      case BusErrorCode.FORBIDDEN:
        console.log('Access denied:', error.details)
        break
    }
  }
}
```

## Type Definitions

### Event Map Definition
```typescript
interface MyEventMap {
  'user:login': { userId: string; email: string }
  'cart:updated': { items: CartItem[]; total: number }
  'navigation:change': { route: string; params?: Record<string, any> }
}
```

### Request/Response Map Definition
```typescript
interface MyRequestMap {
  'get:user:profile': {
    request: { userId: string }
    response: { id: string; name: string; email: string }
  }
  'validate:email': {
    request: { email: string }
    response: { isValid: boolean; errors: string[] }
  }
}
```

### Usage with Types
```typescript
const bus = createBus<MyEventMap, MyRequestMap>({ name: 'typed-bus' })

// Fully typed event emission
bus.emit('user:login', { userId: '123', email: 'user@example.com' })

// Fully typed request/response
const profile = await bus.request('get:user:profile', { userId: '123' })
// profile is typed as { id: string; name: string; email: string }
```

---