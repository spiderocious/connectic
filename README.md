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
  
  // Request/Response
  request<K extends keyof TRequestMap>(event: K, payload?, options?): Promise<Response>
  respond<K extends keyof TRequestMap>(event: K): ResponderBuilder<K>
  
  // State Management
  createState<T>(key: string, initialValue: T): SharedState<T>
  createComputed<T>(computeFn: () => T): ComputedState<T>
  setState<K extends keyof TEventMap>(key: K, value: TEventMap[K]): void
  getState<K extends keyof TEventMap>(key: K): TEventMap[K] | undefined
  
  // Advanced Features
  use(plugin: BusPlugin): this
  namespace(name: string): MFEBus<TEventMap, TRequestMap>
  cache: CacheManager
  interceptRequest(interceptor: RequestInterceptor): void
  interceptResponse(interceptor: ResponseInterceptor): void
  
  // Utilities
  getStats(): BusStats
  destroy(): void
}
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
  }
  maxListeners?: number          // Max listeners per event (default: 100)
  namespace?: string             // Default namespace
  requestTimeout?: number        // Default request timeout in ms
}
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
import { createBus, clearAllBuses } from 'connectic'

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
})
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
console.log(`Memory usage: ${stats.memoryUsage} bytes`)
console.log(`Cache size: ${stats.cacheSize} entries`)

// Detailed component information
const details = bus.getDetailedInfo()
console.log('Event bus:', details.eventBus)
console.log('State manager:', details.stateManager)
console.log('Cache manager:', details.cacheManager)
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
