# connectic Complete API Reference

## Installation & Setup

```bash
npm install connectic
```

```typescript
import { createBus, Plugins, BusError, BusErrorCode } from 'connectic'

interface AppEvents {
  'user:login': { userId: string; email: string }
  'cart:updated': { items: CartItem[]; total: number }
}

interface AppRequests {
  'get:user:profile': {
    request: { userId: string }
    response: { name: string; email: string }
  }
}

const bus = createBus<AppEvents, AppRequests>({ name: 'app' })
```

## Factory Functions

```typescript
// Create/get bus instances
const bus = createBus({ name: 'app', debug: true, cache: { defaultTtl: 300000 } })
const existing = getBus<AppEvents>('app')
const busOrNew = getOrCreateBus({ name: 'app' })

// Management
const removed = removeBus('app') // boolean
clearAllBuses()
const names = listBuses() // string[]
const stats = getAllBusStats() // Record<string, any>
const info = getRegistryInfo() // Registry health info
cleanup() // Clean destroyed buses
```

## Event Communication

```typescript
// Basic pub/sub
bus.emit('user:login', { userId: '123', email: 'user@example.com' })

const unsubscribe = bus.on('cart:updated', (cart) => console.log(cart))
const unsubscribeOnce = bus.once('user:logout', () => console.log('Logged out'))

bus.off('user:login', specificHandler)
bus.removeAllListeners('cart:updated') // or removeAllListeners() for all

// Utility methods
const count = bus.getListenerCount('user:login')
const hasListeners = bus.hasListeners('cart:updated')
```

## Request/Response Patterns

### Basic Requests

```typescript
// Simple request
const profile = await bus.request('get:user:profile', { userId: '123' })

// With full options
const data = await bus.request('get:data', payload, {
  timeout: 5000,
  retries: 2,
  priority: 'high', // 'low' | 'normal' | 'high'
  cache: { 
    ttl: 300000, 
    strategy: 'cache-first', // 'network-first' | 'stale-while-revalidate' | 'cache-only'
    key: 'custom-cache-key'
  },
  signal: abortController.signal
})
```

### Multi-Response & Batch

```typescript
// Collect multiple responses
const sessions = await bus.requestMany('get:all:sessions', { userId: '123' }, {
  timeout: 3000,
  minResponses: 1,
  maxResponses: 10
})

// Batch requests (parallel execution)
const [user, prefs, perms] = await bus.requestBatch([
  ['get:user', { id: '123' }],
  ['get:preferences', { id: '123' }, { timeout: 2000 }],
  ['get:permissions', { id: '123' }]
])
```

### Responders with Middleware Chaining

```typescript
// Basic responder
bus.respond('get:user:profile').handler(async ({ userId }) => {
  return await fetchUser(userId)
})

// Middleware chaining (Express-style)
bus.respond('get:sensitive:data')
   .use(validateAuth)           // Custom middleware
   .use(validatePayload)        // Custom middleware  
   .use(rateLimit)             // Custom middleware
   .handler(async (payload) => {
     return await getSensitiveData(payload)
   })

// Built-in middleware
bus.respond('get:data')
   .use(BuiltinMiddleware.logger())
   .use(BuiltinMiddleware.validator(isValid))
   .use(BuiltinMiddleware.rateLimit({ maxRequests: 10, windowMs: 60000 }))
   .use(BuiltinMiddleware.timeout(5000))
   .handler(async (payload) => payload)
```

## State Management

### Shared State

```typescript
// Create reactive state
const cartState = bus.createState('cart', [])

// Get/set/update
const items = cartState.get()
cartState.set([...items, newItem])
cartState.update(currentItems => [...currentItems, newItem])

// Subscribe to changes
const unsubscribe = cartState.subscribe((items) => updateUI(items))

// Direct bus state methods
bus.setState('user:prefs', { theme: 'dark' })
const prefs = bus.getState('user:prefs')
bus.removeState('temp:data')
```

### Computed State

```typescript
// Basic computed state
const cartTotal = bus.createComputed(() => {
  const items = cartState.get()
  return items.reduce((sum, item) => sum + item.price, 0)
})

const total = cartTotal.get()
cartTotal.subscribe(total => updateTotalDisplay(total))
cartTotal.refresh() // Force recomputation
```

### Advanced State Utilities

```typescript
// Persisted state (localStorage)
const persistedState = SharedStateUtils.createPersistedState(
  stateManager, 'user:preferences', defaultPrefs, 'my_app_prefs'
)

// Derived state from multiple sources
const derivedState = SharedStateUtils.createDerivedState(
  stateManager, 
  ['cart:items', 'user:discounts'], 
  (items, discounts) => calculateTotal(items, discounts)
)

// Debounced state
const debouncedSearch = SharedStateUtils.createDebouncedState(
  stateManager, 'search:query', '', 300
)

// Computed utilities
const memoized = ComputedStateUtils.createMemoized(manager, computeFn, equalityFn)
const combined = ComputedStateUtils.combine(manager, [state1, state2], combiner)
const filtered = ComputedStateUtils.filter(manager, arrayState, predicate)
const mapped = ComputedStateUtils.map(manager, arrayState, mapper)
const reduced = ComputedStateUtils.reduce(manager, arrayState, reducer, initial)

// Async computed state
const asyncData = ComputedStateUtils.createAsync(
  manager, stateManager, 
  async () => fetch('/api/data').then(r => r.json()), 
  null
)
```

## Middleware & Plugin System

### Built-in Plugins

```typescript
// Logger plugin
bus.use(new Plugins.Logger({
  logEmits: true,
  logRequests: true,
  logResponses: true,
  prefix: '[MyApp]'
}))

// Validator plugin
bus.use(new Plugins.Validator({
  'get:user': (payload) => payload.userId ? true : 'Missing userId',
  'update:profile': validateProfileSchema
}))

// Rate limit plugin
bus.use(new Plugins.RateLimit(100, 60000)) // 100 requests per minute
```

### Lifecycle Hooks

```typescript
bus.addHook('beforeEmit', (event, payload) => {
  console.log(`About to emit ${event}:`, payload)
})

bus.addHook('afterEmit', (event, payload) => {
  analytics.track('event_emitted', { event, payload })
})

bus.addHook('beforeOn', (event) => {
  console.log(`Subscribing to ${event}`)
})

bus.addHook('afterOn', (event) => {
  console.log(`Successfully subscribed to ${event}`)
})

bus.removeHook('beforeEmit', specificHandler)
```

### Custom Middleware

```typescript
// Middleware function signature
const authMiddleware: MiddlewareFunction = (payload, next, cancel) => {
  if (!isAuthenticated()) {
    cancel('Authentication required')
    return
  }
  next()
}

const loggingMiddleware: MiddlewareFunction = async (payload, next, cancel) => {
  console.log('Processing request:', payload)
  try {
    next()
  } catch (error) {
    console.error('Request failed:', error)
    throw error
  }
}
```

### Built-in Middleware Functions

```typescript
// Available built-in middleware
BuiltinMiddleware.logger({ logPayload: true, prefix: '[API]' })
BuiltinMiddleware.validator(payload => payload.id ? true : 'Missing ID')
BuiltinMiddleware.rateLimit({ maxRequests: 10, windowMs: 60000 })
BuiltinMiddleware.timeout(5000)
```

## Interceptors

### Request/Response Transformation

```typescript
// Transform all requests
bus.interceptRequest((event, payload) => ({
  ...payload,
  timestamp: Date.now(),
  userId: getCurrentUser()?.id,
  requestId: generateId()
}))

// Transform all responses
bus.interceptResponse((event, response) => ({
  data: response,
  cached: false,
  timestamp: Date.now(),
  event
}))
```

### Built-in Interceptors

```typescript
// Add timestamp to requests
bus.interceptRequest(BuiltinInterceptors.addTimestamp('requestTime'))

// Add request ID
bus.interceptRequest(BuiltinInterceptors.addRequestId('reqId'))

// Add authentication
bus.interceptRequest(BuiltinInterceptors.addAuthentication(
  () => getAuthToken(),
  'authToken'
))

// Validate requests
bus.interceptRequest(BuiltinInterceptors.validateRequest(
  (event, payload) => payload.userId ? true : 'Missing userId'
))

// Transform requests
bus.interceptRequest(BuiltinInterceptors.transformRequest(
  (event, payload) => ({ ...payload, normalized: true })
))

// Log requests/responses
bus.interceptRequest(BuiltinInterceptors.logRequests(console.log, { 
  includePayload: true, 
  prefix: '[REQ]' 
}))
bus.interceptResponse(BuiltinInterceptors.logResponses(console.log, {
  includeResponse: true,
  prefix: '[RES]'
}))

// Validate responses
bus.interceptResponse(BuiltinInterceptors.validateResponse(
  (event, response) => response.data ? true : 'Invalid response'
))

// Add metadata to responses
bus.interceptResponse(BuiltinInterceptors.addResponseMetadata({
  version: '1.0',
  source: 'api'
}))

// Normalize response format
bus.interceptResponse(BuiltinInterceptors.normalizeResponse({
  dataField: 'data',
  errorField: 'error',
  successField: 'success'
}))

// Filter sensitive data
bus.interceptRequest(BuiltinInterceptors.filterSensitiveData(
  ['password', 'creditCard', 'ssn'],
  '[FILTERED]'
))

// Rate limiting
bus.interceptRequest(BuiltinInterceptors.rateLimit(100, 60000))

// Circuit breaker
bus.interceptRequest(BuiltinInterceptors.circuitBreaker(5, 30000))
```

### Interceptor Utilities

```typescript
// Combine multiple interceptors
const combined = InterceptorUtils.combineRequestInterceptors([
  interceptor1, interceptor2, interceptor3
])

// Conditional interceptors
const conditional = InterceptorUtils.conditionalRequest(
  /^api:/, // Only for events starting with 'api:'
  addAuthInterceptor
)

// One-time interceptor
const onceOnly = InterceptorUtils.once(expensiveInterceptor)

// Debounced interceptor
const debounced = InterceptorUtils.debounce(loggingInterceptor, 1000)
```

## Caching

### Cache Configuration

```typescript
const bus = createBus({
  name: 'app',
  cache: {
    defaultTtl: 300000,      // 5 minutes
    maxSize: 1000,           // Max 1000 entries
    strategy: 'cache-first'  // Default strategy
  }
})
```

### Cache Methods

```typescript
// Direct cache access
bus.cache.set('user-123', userData, 60000)
const cached = bus.cache.get('user-123')
const removed = bus.cache.invalidate('user-123')
const count = bus.cache.invalidatePattern('user-*')
bus.cache.clear()
```

### Cache Strategies

```typescript
// Different caching strategies
await bus.request('get:data', payload, {
  cache: { strategy: 'cache-first' }     // Return cache if available
})

await bus.request('get:data', payload, {
  cache: { strategy: 'network-first' }   // Try network, fallback to cache
})

await bus.request('get:data', payload, {
  cache: { strategy: 'stale-while-revalidate' } // Return cache, update in background
})

await bus.request('get:data', payload, {
  cache: { strategy: 'cache-only' }      // Never go to network
})
```

### Cache Utilities

```typescript
// Namespaced cache keys
const key = CacheUtils.createNamespacedKey('user', 'get:profile', { id: '123' })

// Versioned cache keys
const versionedKey = CacheUtils.createVersionedKey('get:data', payload, 'v2')

// Cache warming
await CacheUtils.warmCache(cacheManager, keys, dataFetcher)

// Version migration
const migrated = CacheUtils.migrateVersion(
  cacheManager, 'v1', 'v2', 
  oldData => transformToNewFormat(oldData)
)
```

## Namespacing

```typescript
// Create namespaced buses
const userBus = bus.namespace('user')
const cartBus = bus.namespace('cart')
const nestedBus = userBus.namespace('preferences')

// Scoped communication
userBus.emit('profile:updated', data)     // Emits 'user:profile:updated'
cartBus.on('items:changed', handler)      // Listens for 'cart:items:changed'
nestedBus.emit('theme:changed', theme)    // Emits 'user:preferences:theme:changed'

// Namespace cleanup
userBus.destroy() // Removes all 'user:*' listeners
```

## Error Handling

### Error Types & Codes

```typescript
try {
  const result = await bus.request('get:data', payload)
} catch (error) {
  if (error instanceof BusError) {
    switch (error.busCode) {
      case BusErrorCode.NOT_FOUND:          // 404 - No responders
        console.log('No service available')
        break
      case BusErrorCode.FORBIDDEN:          // 403 - Middleware rejected
        console.log('Access denied:', error.details)
        break
      case BusErrorCode.TIMEOUT:            // 408 - Request timed out
        console.log('Request timed out')
        break
      case BusErrorCode.CONFLICT:           // 409 - Multiple responders
        console.log('Multiple responders found')
        break
      case BusErrorCode.TOO_MANY_REQUESTS:  // 429 - Rate limited
        console.log('Rate limit exceeded')
        break
      case BusErrorCode.INTERNAL_ERROR:     // 500 - Internal error
        console.log('Internal error:', error.message)
        break
    }
  }
}

// Check error properties
if (error.isRetryable()) {
  // Retry the request
}
if (error.isClientError()) {
  // Handle client-side error
}
```

### Error Utilities

```typescript
// Type guards
if (isBusError(error)) {
  console.log('Bus error:', error.busCode)
}

if (hasBusErrorCode(error, BusErrorCode.TIMEOUT)) {
  console.log('Timeout error')
}

// Wrap unknown errors
const busError = wrapError(unknownError, 'get:user')
```

## Utilities & Statistics

### Bus Statistics

```typescript
const stats = bus.getStats()
// {
//   totalEvents: 42,
//   totalRequests: 15, 
//   activeListeners: 8,
//   cacheSize: 12,
//   memoryUsage: 1024
// }

const detailed = bus.getDetailedInfo()
// Complete breakdown of all components
```

### Request/Response Utilities

```typescript
// Timeout wrapper
const timeoutFn = RequestResponseUtils.withTimeout(asyncFn, 5000)

// Retry wrapper  
const retryFn = RequestResponseUtils.withRetries(asyncFn, 3, 1000)

// Circuit breaker
const breaker = RequestResponseUtils.createCircuitBreaker(5, 30000)
const result = await breaker(asyncFn)
```

## Memory Management & Cleanup

```typescript
// Clean up subscriptions
const unsubscribe = bus.on('event', handler)
unsubscribe()

// Clean up state
const state = bus.createState('key', value)
state.destroy()

// Clean up computed state
const computed = bus.createComputed(computeFn)
computed.destroy()

// Destroy entire bus
bus.destroy() // Cleans up everything

// Check if destroyed
if (bus.isDestroyedState()) {
  console.log('Bus is destroyed')
}
```

## Complete Usage Example

```typescript
// Setup with full configuration
const bus = createBus<AppEvents, AppRequests>({
  name: 'my-app',
  debug: true,
  cache: {
    defaultTtl: 300000,
    maxSize: 1000,
    strategy: 'cache-first'
  }
})

// Add plugins and middleware
bus.use(new Plugins.Logger({ prefix: '[MyApp]' }))
   .use(new Plugins.Validator(schemas))
   .use(new Plugins.RateLimit(100, 60000))

// Add interceptors
bus.interceptRequest(BuiltinInterceptors.addTimestamp())
bus.interceptResponse(BuiltinInterceptors.normalizeResponse())

// Set up responders with middleware
bus.respond('api:get:user')
   .use(BuiltinMiddleware.validator(validateUserId))
   .use(BuiltinMiddleware.rateLimit({ maxRequests: 10, windowMs: 60000 }))
   .handler(async ({ userId }) => {
     return await fetchUser(userId)
   })

// Create reactive state
const userState = bus.createState('user', null)
const cartState = bus.createState('cart', [])

// Create computed state
const cartTotal = bus.createComputed(() => {
  const items = cartState.get()
  return items.reduce((sum, item) => sum + item.price, 0)
})

// Use namespaced buses
const apisBus = bus.namespace('api')
const userApiBus = apisBus.namespace('user')

// Event communication
bus.emit('user:login', { userId: '123', email: 'user@example.com' })
bus.on('cart:updated', (cart) => updateCartUI(cart))

// Request/response with full options
try {
  const profile = await bus.request('api:get:user', { userId: '123' }, {
    timeout: 5000,
    retries: 2,
    cache: { ttl: 300000, strategy: 'stale-while-revalidate' }
  })
  
  userState.set(profile)
} catch (error) {
  if (error instanceof BusError) {
    handleBusError(error)
  }
}

// Cleanup when done
const cleanup = () => {
  userState.destroy()
  cartState.destroy() 
  cartTotal.destroy()
  bus.destroy()
}
```