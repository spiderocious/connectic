/**
 * connectic - Core Module Exports
 *
 * This file exports all core components and utilities from the connectic library.
 * It provides a clean interface for importing core functionality.
 */

// Core event bus
export { EventBus, NamespacedEventBus } from './event-bus';

// Registry and instance management
export {
  BusRegistry,
  createBusInstance,
  getBusInstance,
  getOrCreateBusInstance,
  removeBusInstance,
  clearAllBusInstances,
  listBusInstances,
} from './registry';

// Middleware and plugin system
export {
  MiddlewareManager,
  ResponderBuilder,
  BuiltinMiddleware,
} from './middleware';

// State management
export {
  SharedStateManager,
  SharedStateImpl,
  SharedStateUtils,
} from './shared-state';

// Computed state management
export {
  ComputedStateManager,
  ComputedStateImpl,
  ComputedStateUtils,
} from './computed-state';

// Cache management
export { CacheManager, CacheUtils } from './cache';

// Request/response patterns
export {
  RequestResponseManager,
  RequestResponseUtils,
} from './request-response';

// Interceptor management
export {
  InterceptorManager,
  BuiltinInterceptors,
  InterceptorUtils,
} from './interceptors';

// Utility functions
export * from './utils';
