# 🚀 connectic

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**Framework-agnostic event-driven communication library for modern JavaScript applications.**

Connectic enables seamless communication between microfrontends, components, and services through a unified API that combines event bus patterns, reactive state management, and request/response communication with full TypeScript support.

## ✨ Features

### 🔄 **Event-Driven Architecture**
- **Pub/Sub messaging** with automatic cleanup and memory leak prevention
- **Request/Response patterns** with timeout handling and caching
- **Cross-component communication** without tight coupling

### 🏗️ **Microfrontend Ready**
- **Cross-application state sharing** between different frameworks
- **Namespace isolation** for clean separation of concerns  
- **Module Federation compatible** with singleton dependency management

### ⚡ **Reactive State Management**
- **Shared state** with automatic synchronization across components
- **Computed state** with dependency tracking (experimental)
- **Type-safe state operations** with TypeScript generics

### 🔧 **Advanced Features**
- **Middleware system** for logging, validation, and custom logic
- **Request/Response interceptors** for data transformation
- **Built-in caching** with TTL and pattern-based invalidation
- **Plugin architecture** for extensibility
- **Memory management** with automatic cleanup and statistics

## 🚀 Quick Start

### Installation

```bash
npm install connectic
# or
yarn add connectic
# or
pnpm add connectic
```

### Basic Usage

```typescript
import { createBus } from 'connectic'

// Define your event and request types
interface Events {
  'user:login': { userId: string; email: string }
  'cart:updated': { items: CartItem[]; total: number }
}

interface Requests {
  'get:user:profile': {
    request: { userId: string }
    response: { id: string; name: string; email: string }
  }
}

// Create a typed bus instance
const bus = createBus<Events, Requests>({ 
  name: 'my-app',
  debug: true 
})

// Event communication
bus.on('user:login', ({ userId, email }) => {
  console.log(`User ${userId} logged in: ${email}`)
})

bus.emit('user:login', { 
  userId: '123', 
  email: 'user@example.com' 
})

// Request/Response patterns
bus.respond('get:user:profile').handler(async ({ userId }) => {
  return await fetchUserProfile(userId)
})

const profile = await bus.request('get:user:profile', { userId: '123' })
```

### Shared State Management

```typescript
// Create reactive shared state
const userState = bus.createState('user', null)
const cartState = bus.createState('cart', [])

// Subscribe to state changes
userState.subscribe((user) => {
  console.log('User changed:', user)
})

// Update state
userState.set({ id: '123', name: 'John Doe' })

// State automatically synchronizes across components/applications
```

## 🏗️ Architecture Patterns

### Microfrontend Communication

```typescript
// Shell Application
const globalBus = createBus({ name: 'global' })

// Microfrontend A (React)
const mfeA = getBus('global') // Gets existing instance
mfeA.emit('navigation:change', { route: '/products' })

// Microfrontend B (Vue)  
const mfeB = getBus('global') // Same instance
mfeB.on('navigation:change', ({ route }) => {
  router.push(route)
})
```

### Service Layer Pattern

```typescript
// API Service
class UserService {
  constructor(private bus: MFEBus) {
    this.setupResponders()
  }

  private setupResponders() {
    this.bus.respond('user:get').handler(async ({ id }) => {
      return await this.fetchUser(id)
    })
    
    this.bus.respond('user:create').handler(async (userData) => {
      return await this.createUser(userData)
    })
  }
}

// Components can now use the service via requests
const user = await bus.request('user:get', { id: '123' })
```

### State Management Pattern

```typescript
// Centralized state management
const appState = {
  user: bus.createState('user', null),
  cart: bus.createState('cart', []),
  theme: bus.createState('theme', 'light')
}

// Computed state (experimental)
const cartTotal = bus.createComputed(() => {
  const items = appState.cart.get()
  return items.reduce((sum, item) => sum + item.price, 0)
})

// React Hook integration
function useAppState() {
  const [user, setUser] = useState(appState.user.get())
  
  useEffect(() => {
    return appState.user.subscribe(setUser)
  }, [])
  
  return user
}
```

## 🔧 Advanced Features

### Built-in Plugins

Connectic comes with powerful built-in plugins for common use cases:

#### Logger Plugin

```typescript
import { createBus, Plugins } from 'connectic'

const bus = createBus({ name: 'app' })

// Enable comprehensive logging
bus.use(new Plugins.Logger({
  logEmits: true,       // Log event emissions
  logRequests: true,    // Log request/response requests
  logResponses: true,   // Log request/response responses
  prefix: '[MyApp]'     // Custom log prefix
}))

// Selective logging
bus.use(new Plugins.Logger({
  logEmits: false,      // Only log requests/responses
  logRequests: true,
  logResponses: true,
  prefix: '[API]'
}))
```

#### Validator Plugin

```typescript
// Schema-based request validation
bus.use(new Plugins.Validator({
  'user:create': (payload) => {
    if (!payload.email) return 'Email is required'
    if (!payload.name) return 'Name is required'
    return true // Valid
  },
  'user:update': (payload) => {
    return payload.id ? true : 'User ID is required'
  }
}))

// Requests are automatically validated
try {
  await bus.request('user:create', { name: 'John' }) // Throws validation error
} catch (error) {
  console.log(error.message) // "Email is required"
}
```

#### Rate Limiting Plugin

```typescript
// Limit requests per event
bus.use(new Plugins.RateLimit(
  10,     // Max 10 requests
  60000   // Per 60 seconds
))

// Requests exceeding limit throw BusError with code 429
```

### Middleware System

```typescript
const bus = createBus({
  name: 'app',
  middleware: [
    {
      name: 'logger',
      handler: async (context, next) => {
        console.log(`[${context.eventName}] started`)
        const result = await next()
        console.log(`[${context.eventName}] completed`)
        return result
      }
    }
  ]
})

// Add middleware at runtime
bus.addHook('beforeEmit', (event, payload) => {
  console.log(`Emitting ${event}`, payload)
})

bus.addHook('afterEmit', (event, payload) => {
  console.log(`Emitted ${event}`)
})
```

### Built-in Middleware

```typescript
import { BuiltinMiddleware } from 'connectic'

// Pre-built middleware for common tasks
bus.use(BuiltinMiddleware.createLogger({ prefix: '[CUSTOM]' }))
bus.use(BuiltinMiddleware.createValidator(schemas))
bus.use(BuiltinMiddleware.createRateLimit(5, 10000))
```

### Plugin Architecture

```typescript
// Custom plugin
const analyticsPlugin = {
  name: 'Analytics',
  version: '1.0.0',
  init: () => Promise.resolve(),
  onEvent: (eventName, payload) => {
    analytics.track(eventName, payload)
  },
  onRequest: (eventName, payload) => {
    analytics.track(`request:${eventName}`, payload)
  }
}

bus.use(analyticsPlugin)
```

### Request/Response Interceptors

Transform request and response data with powerful interceptor system:

```typescript
// Request interceptors - transform outgoing requests
bus.interceptRequest((event, payload) => {
  return {
    ...payload,
    timestamp: Date.now(),
    requestId: generateId()
  }
})

// Response interceptors - transform incoming responses
bus.interceptResponse((event, response) => {
  return {
    data: response,
    receivedAt: Date.now(),
    event
  }
})
```

### Built-in Interceptors

```typescript
import { BuiltinInterceptors } from 'connectic'

// Add timestamp to all requests
bus.interceptRequest(BuiltinInterceptors.addTimestamp())

// Validate responses
bus.interceptResponse(BuiltinInterceptors.validateResponse((event, response) => {
  return response && response.success === true
}))

// Transform response format
bus.interceptResponse(BuiltinInterceptors.normalizeResponse({
  dataField: 'data',
  errorField: 'error',
  successField: 'success'
}))

// Filter sensitive data from requests
bus.interceptRequest(BuiltinInterceptors.filterSensitiveData(['password', 'token']))

// Add performance tracking
bus.interceptResponse(BuiltinInterceptors.addPerformanceMetrics((event, start, end) => {
  console.log(`${event} took ${end - start}ms`)
}))

// Rate limiting
bus.interceptRequest(BuiltinInterceptors.rateLimit(10, 60000))

// Circuit breaker pattern
bus.interceptRequest(BuiltinInterceptors.circuitBreaker(5, 30000))
```

### Interceptor Utils

```typescript
import { InterceptorUtils } from 'connectic'

// Combine multiple interceptors
const combinedInterceptor = InterceptorUtils.combineRequestInterceptors([
  InterceptorUtils.addTimestamp(),
  InterceptorUtils.addRequestId(),
  InterceptorUtils.addAuthentication(() => getAuthToken())
])

bus.interceptRequest(combinedInterceptor)

// Conditional interceptors
bus.interceptRequest(
  InterceptorUtils.conditionalRequest(
    /^user:/, // Only for user events
    InterceptorUtils.validateRequest(userValidator)
  )
)

// One-time interceptor
bus.interceptRequest(
  InterceptorUtils.once(InterceptorUtils.addTimestamp())
)

// Debounced interceptor
bus.interceptResponse(
  InterceptorUtils.debounce(logResponse, 1000)
)
```

### Caching & Performance

```typescript
const bus = createBus({
  name: 'app',
  cache: { 
    defaultTtl: 300000, // 5 minutes
    maxSize: 1000
  }
})

// Requests are automatically cached
const user = await bus.request('get:user', { id: '123' }) // Fetches from API
const userAgain = await bus.request('get:user', { id: '123' }) // Returns from cache

// Manual cache control
bus.cache.invalidate('get:user:123')
bus.cache.invalidatePattern('get:user:*')
bus.cache.clear()

// Cache utilities
import { CacheUtils } from 'connectic'

// Custom cache strategies
CacheUtils.createStrategy('LRU', { maxSize: 100 })
CacheUtils.createStrategy('TTL', { defaultTtl: 60000 })
```

### Advanced Request Methods

```typescript
// Request with multiple responders
const responses = await bus.requestMany('search:products', 
  { query: 'laptop' },
  { 
    maxResponders: 3,  // Wait for up to 3 responses
    timeout: 5000      // 5 second timeout
  }
)

// Batch requests
const results = await bus.requestBatch([
  ['get:user', { id: '1' }],
  ['get:posts', { userId: '1' }],
  ['get:comments', { userId: '1' }]
])

// Request with custom options
const user = await bus.request('get:user', { id: '123' }, {
  timeout: 10000,     // Custom timeout
  cache: false,       // Skip cache
  retries: 3          // Retry on failure
})
```

### Namespacing

```typescript
const globalBus = createBus({ name: 'app' })

// Create isolated namespaces
const userNamespace = globalBus.namespace('user')
const cartNamespace = globalBus.namespace('cart')

// Events are automatically namespaced
userNamespace.emit('login', { userId: '123' }) // Emits 'user:login'
cartNamespace.emit('updated', { items: [] })   // Emits 'cart:updated'

// But you can listen to them from the global bus
globalBus.on('user:login', handler)
globalBus.on('cart:updated', handler)
```

### Error Handling

Connectic provides comprehensive error handling with detailed error information:

```typescript
import { BusError, BusErrorCode, BusErrorFactory, isBusError, hasBusErrorCode } from 'connectic'

try {
  await bus.request('nonexistent:service', {})
} catch (error) {
  if (isBusError(error)) {
    console.log('Bus error:', error.message)
    console.log('Error code:', error.code)
    console.log('Context:', error.context)
    
    // Check specific error types
    if (hasBusErrorCode(error, BusErrorCode.TIMEOUT)) {
      console.log('Request timed out')
    }
  }
}

// Create custom errors
throw BusErrorFactory.timeout('my:request', 5000)
throw BusErrorFactory.notFound('user:123')
throw BusErrorFactory.unauthorized('admin:action')
throw BusErrorFactory.badRequest('invalid:payload', 'Missing required field')
```

### Advanced Utilities

```typescript
// Listener management
bus.hasListeners('user:login')           // Check if event has listeners
bus.getListenerCount('user:login')       // Get number of listeners
bus.removeAllListeners('user:login')     // Remove all listeners for event
bus.removeAllListeners()                 // Remove ALL listeners

// State management
bus.removeState('user')                  // Remove shared state
bus.getState('user')                     // Get current state value

// Bus lifecycle
bus.isDestroyedState()                   // Check if bus is destroyed
bus.getDetailedInfo()                    // Get comprehensive bus information
bus.destroy()                            // Clean up and destroy bus
```

## 📖 API Reference

### Factory Functions

```typescript
// Create a new bus instance
createBus<Events, Requests>(config: BusConfig): MFEBus<Events, Requests>

// Get existing bus instance
getBus<Events, Requests>(name: string): MFEBus<Events, Requests> | null

// Get or create bus instance  
getOrCreateBus<Events, Requests>(config: BusConfig): MFEBus<Events, Requests>

// Remove bus instance
removeBus(name: string): boolean

// Clear all bus instances
clearAllBuses(): void
```

### Core Methods

```typescript
interface MFEBus<TEventMap, TRequestMap> {
  // Event Communication
  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void
  on<K extends keyof TEventMap>(event: K, handler: (payload: TEventMap[K]) => void): () => void
  once<K extends keyof TEventMap>(event: K, handler: (payload: TEventMap[K]) => void): () => void
  off<K extends keyof TEventMap>(event: K, handler: Function): void
  removeAllListeners<K extends keyof TEventMap>(event?: K): void
  
  // Request/Response  
  request<K extends keyof TRequestMap>(event: K, payload?, options?): Promise<Response>
  requestMany<K extends keyof TRequestMap>(event: K, payload?, options?): Promise<Response[]>
  requestBatch(requests: BatchRequest[]): Promise<any[]>
  respond<K extends keyof TRequestMap>(event: K): ResponderBuilder<K>
  
  // State Management
  createState<T>(key: string, initialValue: T): SharedState<T>
  createComputed<T>(computeFn: () => T): ComputedState<T>
  setState<K extends keyof TEventMap>(key: K, value: TEventMap[K]): void
  getState<K extends keyof TEventMap>(key: K): TEventMap[K] | undefined
  removeState<K extends keyof TEventMap>(key: K): void
  
  // Advanced Features
  use(plugin: BusPlugin): this
  namespace(name: string): MFEBus<TEventMap, TRequestMap>
  addHook(type: HookType, handler: HookHandler): void
  removeHook(type: HookType, handler: HookHandler): void
  
  // Interceptors
  interceptRequest(interceptor: RequestInterceptor): void
  interceptResponse(interceptor: ResponseInterceptor): void
  
  // Cache Management
  cache: {
    get(key: string): any
    set(key: string, value: any, ttl?: number): void
    invalidate(key: string): boolean
    invalidatePattern(pattern: string): number
    clear(): void
  }
  
  // Utilities
  hasListeners<K extends keyof TEventMap>(event: K): boolean
  getListenerCount<K extends keyof TEventMap>(event: K): number
  getStats(): BusStats
  getDetailedInfo(): object
  isDestroyedState(): boolean
  destroy(): void
}
```

### Factory & Registry Functions

```typescript
// Core factory functions
createBus<Events, Requests>(config: BusConfig): MFEBus<Events, Requests>
getBus<Events, Requests>(name: string): MFEBus<Events, Requests> | null
getOrCreateBus<Events, Requests>(config: BusConfig): MFEBus<Events, Requests>

// Registry management
removeBus(name: string): boolean
clearAllBuses(): void
listBuses(): string[]
getAllBusStats(): Record<string, BusStats>
getRegistryInfo(): object
cleanup(): void
```

### Built-in Exports

```typescript
// Built-in plugins
import { Plugins } from 'connectic'
Plugins.Logger        // Comprehensive logging plugin
Plugins.Validator     // Schema validation plugin  
Plugins.RateLimit     // Request rate limiting plugin

// Utility classes
import { 
  BuiltinMiddleware,    // Pre-built middleware functions
  BuiltinInterceptors,  // Pre-built interceptor functions
  InterceptorUtils,     // Interceptor helper utilities
  SharedStateUtils,     // State management utilities
  ComputedStateUtils,   // Computed state utilities
  CacheUtils,           // Cache management utilities
  RequestResponseUtils  // Request/response utilities
} from 'connectic'

// Error handling
import {
  BusError,             // Custom error class
  BusErrorCode,         // Error code constants
  BusErrorFactory,      // Error creation utilities
  isBusError,           // Error type checking
  hasBusErrorCode,      // Error code checking
  wrapError            // Error wrapping utility
} from 'connectic'

// Library metadata
import { VERSION, META } from 'connectic'
console.log(META.version)    // "1.0.0"
console.log(META.name)       // "connectic"
```
```

## 📦 Framework Integration

### React

```typescript
// Custom hook for reactive state
function useBusState<T>(key: string, initialValue: T) {
  const state = bus.createState(key, initialValue)
  const [value, setValue] = useState(state.get())
  
  useEffect(() => {
    return state.subscribe(setValue)
  }, [state])
  
  return [value, state.set.bind(state)] as const
}

// Usage
function UserProfile() {
  const [user, setUser] = useBusState('user', null)
  // Component automatically re-renders when user state changes
}
```

### Vue 3

```typescript
// Composable for reactive state
export function useBusState<T>(key: string, initialValue: T) {
  const state = bus.createState(key, initialValue)
  const value = ref(state.get())
  
  state.subscribe((newValue) => {
    value.value = newValue
  })
  
  return {
    value: readonly(value),
    setValue: state.set.bind(state)
  }
}
```

### Angular

```typescript
@Injectable()
export class BusStateService {
  getState<T>(key: string, initialValue: T) {
    const state = bus.createState(key, initialValue)
    return new BehaviorSubject(state.get()).pipe(
      tap(() => state.subscribe(value => subject.next(value)))
    )
  }
}
```

## 🔧 Configuration

```typescript
interface BusConfig {
  name: string                    // Unique bus identifier
  debug?: boolean                 // Enable debug logging
  middleware?: Middleware[]       // Custom middleware stack
  plugins?: BusPlugin[]          // Plugin instances
  cache?: {
    defaultTtl?: number          // Default cache TTL in ms
    maxSize?: number             // Maximum cache entries
    strategy?: CacheStrategy     // Cache eviction strategy
  }
  maxListeners?: number          // Max listeners per event (default: 100)
  namespace?: string             // Default namespace
  requestTimeout?: number        // Default request timeout in ms (default: 5000)
  retryOptions?: {
    maxRetries?: number          // Maximum retry attempts
    retryDelay?: number          // Delay between retries in ms
    backoffFactor?: number       // Exponential backoff multiplier
  }
}

// Advanced configuration examples
const bus = createBus({
  name: 'production-app',
  debug: process.env.NODE_ENV === 'development',
  cache: {
    defaultTtl: 300000,          // 5 minutes
    maxSize: 10000,              // 10k entries
    strategy: 'LRU'              // Least Recently Used eviction
  },
  requestTimeout: 10000,         // 10 second timeout
  maxListeners: 500,             // High listener limit
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffFactor: 2
  }
})
```

## 🚀 Real-World Examples

### E-commerce Microfrontend Architecture

```typescript
// Product Catalog (React MFE)
const catalog = getBus('ecommerce')
catalog.respond('product:search').handler(async ({ query, filters }) => {
  return await searchProducts(query, filters)
})

// Shopping Cart (Vue MFE)  
const cart = getBus('ecommerce')
cart.on('product:add-to-cart', async ({ productId, quantity }) => {
  const product = await cart.request('product:get', { id: productId })
  cartState.update(items => [...items, { ...product, quantity }])
  cart.emit('cart:updated', { items: cartState.get() })
})

// Checkout (Angular MFE)
const checkout = getBus('ecommerce')
checkout.on('cart:updated', ({ items }) => {
  this.orderSummary = this.calculateOrderSummary(items)
})
```

### Real-time Dashboard

```typescript
// Data layer
const dashboard = createBus({ name: 'dashboard' })

// WebSocket service
dashboard.respond('metrics:subscribe').handler(async ({ metric }) => {
  return websocket.subscribe(metric, (data) => {
    dashboard.emit('metrics:updated', { metric, data })
  })
})

// Chart components automatically update
dashboard.on('metrics:updated', ({ metric, data }) => {
  if (metric === 'sales') {
    updateSalesChart(data)
  }
})
```

## 🧪 Testing

```typescript
import { createBus, clearAllBuses, BusError, isBusError } from 'connectic'

describe('My Application', () => {
  let bus: MFEBus
  
  beforeEach(() => {
    bus = createBus({ name: 'test-app' })
  })
  
  afterEach(() => {
    clearAllBuses() // Clean up for next test
  })
  
  it('should handle user login flow', async () => {
    const mockUser = { id: '123', name: 'John' }
    
    bus.respond('auth:login').handler(async () => mockUser)
    
    const loginSpy = jest.fn()
    bus.on('user:logged-in', loginSpy)
    
    const user = await bus.request('auth:login', { email: 'test@example.com' })
    bus.emit('user:logged-in', user)
    
    expect(loginSpy).toHaveBeenCalledWith(mockUser)
  })
  
  it('should handle errors properly', async () => {
    bus.respond('failing:service').handler(() => {
      throw new Error('Service failed')
    })
    
    try {
      await bus.request('failing:service')
    } catch (error) {
      expect(isBusError(error)).toBe(true)
      expect(error.message).toContain('Service failed')
    }
  })
  
  it('should validate listener counts', () => {
    const handler = () => {}
    bus.on('test:event', handler)
    
    expect(bus.hasListeners('test:event')).toBe(true)
    expect(bus.getListenerCount('test:event')).toBe(1)
    
    bus.off('test:event', handler)
    expect(bus.hasListeners('test:event')).toBe(false)
  })
  
  it('should handle batch requests', async () => {
    bus.respond('get:user').handler(async ({ id }) => ({ id, name: `User ${id}` }))
    bus.respond('get:posts').handler(async ({ userId }) => [{ id: 1, userId, title: 'Post 1' }])
    
    const results = await bus.requestBatch([
      ['get:user', { id: '1' }],
      ['get:posts', { userId: '1' }]
    ])
    
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ id: '1', name: 'User 1' })
    expect(results[1]).toHaveLength(1)
  })
  
  it('should handle state management', () => {
    const userState = bus.createState('user', null)
    const values: any[] = []
    
    userState.subscribe((value) => values.push(value))
    
    userState.set({ id: '123', name: 'John' })
    userState.set({ id: '456', name: 'Jane' })
    
    expect(values).toEqual([
      null,
      { id: '123', name: 'John' },
      { id: '456', name: 'Jane' }
    ])
    
    bus.removeState('user')
    expect(bus.getState('user')).toBeUndefined()
  })
}
```

## 📊 Performance & Memory Management

### Built-in Optimizations

- **Automatic cleanup** of event listeners and state subscriptions
- **Memory leak prevention** with configurable listener limits
- **Efficient data structures** using Map/Set for O(1) operations
- **Request caching** to reduce redundant API calls
- **Dead code elimination** for smaller bundle sizes

### Memory Usage Monitoring

```typescript
// Get detailed statistics
const stats = bus.getStats()
console.log(`Active listeners: ${stats.activeListeners}`)
console.log(`Total events: ${stats.totalEvents}`)
console.log(`Total requests: ${stats.totalRequests}`)
console.log(`Memory usage: ${stats.memoryUsage} bytes`)
console.log(`Cache size: ${stats.cacheSize} entries`)

// Get comprehensive component information
const details = bus.getDetailedInfo()
console.log('Event bus:', details.eventBus)
console.log('State manager:', details.stateManager)
console.log('Cache manager:', details.cacheManager)
console.log('Request manager:', details.requestManager)
console.log('Interceptor manager:', details.interceptorManager)

// Registry-wide statistics
const allStats = getAllBusStats()
console.log('All bus instances:', allStats)

// Registry health information
const registryInfo = getRegistryInfo()
console.log('Registry status:', registryInfo)

// Cleanup operations
cleanup() // Performs maintenance on registry
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/spiderocious/connectic.git
cd connectic

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build the library
npm run build

# Run type checking
npm run type-check

# Run linting
npm run lint
```

### Project Structure

```
src/
├── core/           # Core implementations
│   ├── event-bus.ts      # Event system
│   ├── registry.ts       # Bus instance management
│   ├── middleware.ts     # Middleware & plugins
│   ├── shared-state.ts   # State management
│   ├── computed-state.ts # Computed state (experimental)
│   ├── cache.ts          # Caching layer
│   └── request-response.ts # Request/response patterns
├── errors/         # Error handling
├── types.ts        # TypeScript definitions
└── index.ts        # Main exports
```

## 📄 License

MIT © [connectic](LICENSE)

## 🔗 Links

- [Documentation](https://github.com/spiderocious/connectic/wiki)
- [API Reference](https://github.com/spiderocious/connectic/blob/main/docs/api.md)
- [Examples](https://github.com/spiderocious/connectic/tree/main/examples)
- [Changelog](https://github.com/spiderocious/connectic/blob/main/CHANGELOG.md)
- [Issues](https://github.com/spiderocious/connectic/issues)

---

**Made with ❤️ for the modern JavaScript ecosystem**

*"Connecting applications, components, and services with simplicity and type safety"*
