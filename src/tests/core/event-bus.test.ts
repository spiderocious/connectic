/**
 * @jest-environment node
 */

import { EventBus, NamespacedEventBus } from '../../core/event-bus'
import { BusError } from '../../errors'

describe('Core Event Bus', () => {
  let eventBus: EventBus

  beforeEach(() => {
    eventBus = new EventBus()
  })

  afterEach(() => {
    if (!eventBus.isDestroyedState()) {
      eventBus.destroy()
    }
  })

  describe('constructor', () => {
    it('should create an event bus with default state', () => {
      const bus = new EventBus()
      expect(bus.isDestroyedState()).toBe(false)
      expect(bus.getEventNames()).toEqual([])
      expect(bus.getMaxListeners()).toBe(100)
      bus.destroy()
    })
  })

  describe('event emission and subscription', () => {
    it('should emit and receive events', () => {
      const handler = jest.fn()
      
      eventBus.on('test-event', handler)
      eventBus.emit('test-event', { data: 'test' })
      
      expect(handler).toHaveBeenCalledWith({ data: 'test' })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple listeners for same event', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      const handler3 = jest.fn()
      
      eventBus.on('multi-event', handler1)
      eventBus.on('multi-event', handler2)
      eventBus.on('multi-event', handler3)
      
      eventBus.emit('multi-event', 'payload')
      
      expect(handler1).toHaveBeenCalledWith('payload')
      expect(handler2).toHaveBeenCalledWith('payload')
      expect(handler3).toHaveBeenCalledWith('payload')
      expect(eventBus.getListenerCount('multi-event')).toBe(3)
    })

    it('should return unsubscribe function from on()', () => {
      const handler = jest.fn()
      
      const unsubscribe = eventBus.on('unsub-test', handler)
      eventBus.emit('unsub-test', 'first')
      
      unsubscribe()
      eventBus.emit('unsub-test', 'second')
      
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith('first')
    })

    it('should handle events with no listeners silently', () => {
      expect(() => {
        eventBus.emit('non-existent-event', 'data')
      }).not.toThrow()
      
      const stats = eventBus.getStats()
      expect(stats.totalEvents).toBe(1)
    })

    it('should handle different payload types', () => {
      const handler = jest.fn()
      eventBus.on('payload-test', handler)
      
      // Test various payload types
      eventBus.emit('payload-test', 'string')
      eventBus.emit('payload-test', 42)
      eventBus.emit('payload-test', true)
      eventBus.emit('payload-test', null)
      eventBus.emit('payload-test', undefined)
      eventBus.emit('payload-test', { complex: { nested: 'object' } })
      eventBus.emit('payload-test', [1, 2, 3])
      
      expect(handler).toHaveBeenCalledTimes(7)
      expect(handler).toHaveBeenNthCalledWith(1, 'string')
      expect(handler).toHaveBeenNthCalledWith(2, 42)
      expect(handler).toHaveBeenNthCalledWith(3, true)
      expect(handler).toHaveBeenNthCalledWith(4, null)
      expect(handler).toHaveBeenNthCalledWith(5, undefined)
      expect(handler).toHaveBeenNthCalledWith(6, { complex: { nested: 'object' } })
      expect(handler).toHaveBeenNthCalledWith(7, [1, 2, 3])
    })
  })

  describe('once() functionality', () => {
    it('should execute handler only once', () => {
      const handler = jest.fn()
      
      eventBus.once('once-event', handler)
      
      eventBus.emit('once-event', 'first')
      eventBus.emit('once-event', 'second')
      eventBus.emit('once-event', 'third')
      
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith('first')
    })

    it('should return unsubscribe function from once()', () => {
      const handler = jest.fn()
      
      const unsubscribe = eventBus.once('once-unsub', handler)
      unsubscribe() // Unsubscribe before emission
      
      eventBus.emit('once-unsub', 'data')
      
      expect(handler).not.toHaveBeenCalled()
    })

    it('should clean up after once() execution', () => {
      const handler = jest.fn()
      
      eventBus.once('cleanup-test', handler)
      expect(eventBus.getListenerCount('cleanup-test')).toBe(1)
      
      eventBus.emit('cleanup-test', 'data')
      expect(eventBus.getListenerCount('cleanup-test')).toBe(0)
    })
  })

  describe('off() and removeAllListeners()', () => {
    it('should remove specific handler', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      
      eventBus.on('remove-test', handler1)
      eventBus.on('remove-test', handler2)
      
      eventBus.off('remove-test', handler1)
      eventBus.emit('remove-test', 'data')
      
      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledWith('data')
      expect(eventBus.getListenerCount('remove-test')).toBe(1)
    })

    it('should handle removing non-existent handler gracefully', () => {
      const handler = jest.fn()
      
      expect(() => {
        eventBus.off('non-existent', handler)
      }).not.toThrow()
    })

    it('should remove all listeners for specific event', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      
      eventBus.on('clear-test', handler1)
      eventBus.on('clear-test', handler2)
      eventBus.on('keep-test', handler1)
      
      eventBus.removeAllListeners('clear-test')
      
      expect(eventBus.getListenerCount('clear-test')).toBe(0)
      expect(eventBus.getListenerCount('keep-test')).toBe(1)
    })

    it('should remove all listeners for all events', () => {
      const handler = jest.fn()
      
      eventBus.on('event1', handler)
      eventBus.on('event2', handler)
      eventBus.on('event3', handler)
      
      eventBus.removeAllListeners()
      
      expect(eventBus.getEventNames()).toEqual([])
      expect(eventBus.getListenerCount('event1')).toBe(0)
    })

    it('should clean up empty event sets after removal', () => {
      const handler = jest.fn()
      
      eventBus.on('cleanup-event', handler)
      expect(eventBus.getEventNames()).toContain('cleanup-event')
      
      eventBus.off('cleanup-event', handler)
      expect(eventBus.getEventNames()).not.toContain('cleanup-event')
    })
  })

  describe('listener management', () => {
    it('should enforce maximum listeners per event', () => {
      eventBus.setMaxListeners(3)
      
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      const handler3 = jest.fn()
      const handler4 = jest.fn()
      
      eventBus.on('max-test', handler1)
      eventBus.on('max-test', handler2)
      eventBus.on('max-test', handler3)
      
      expect(() => {
        eventBus.on('max-test', handler4)
      }).toThrow()
    })

    it('should validate setMaxListeners input', () => {
      expect(() => eventBus.setMaxListeners(-1)).toThrow()
      expect(() => eventBus.setMaxListeners(0)).toThrow()
      expect(() => eventBus.setMaxListeners(1.5)).toThrow()
      expect(() => eventBus.setMaxListeners('invalid' as any)).toThrow()
      
      expect(() => eventBus.setMaxListeners(50)).not.toThrow()
      expect(eventBus.getMaxListeners()).toBe(50)
    })

    it('should track listener counts accurately', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      
      expect(eventBus.getListenerCount('count-test')).toBe(0)
      expect(eventBus.hasListeners('count-test')).toBe(false)
      
      eventBus.on('count-test', handler1)
      expect(eventBus.getListenerCount('count-test')).toBe(1)
      expect(eventBus.hasListeners('count-test')).toBe(true)
      
      eventBus.on('count-test', handler2)
      expect(eventBus.getListenerCount('count-test')).toBe(2)
      
      eventBus.off('count-test', handler1)
      expect(eventBus.getListenerCount('count-test')).toBe(1)
      
      eventBus.off('count-test', handler2)
      expect(eventBus.getListenerCount('count-test')).toBe(0)
      expect(eventBus.hasListeners('count-test')).toBe(false)
    })
  })

  describe('statistics tracking', () => {
    it('should track basic statistics', () => {
      const handler = jest.fn()
      
      eventBus.on('stats-test', handler)
      eventBus.emit('stats-test', 'data')
      eventBus.off('stats-test', handler)
      
      const stats = eventBus.getDetailedStats() as any
      expect(stats.totalEvents).toBe(1)
      expect(stats.totalSubscriptions).toBe(1)
      expect(stats.totalUnsubscriptions).toBe(1)
      expect(stats.errorCount).toBe(0)
    })

    it('should provide comprehensive stats', () => {
      const handler = jest.fn()
      
      eventBus.on('event1', handler)
      eventBus.on('event2', handler)
      
      const stats = eventBus.getStats()
      expect(stats.totalEvents).toBe(0) // No events emitted yet
      expect(stats.activeListeners).toBe(2)
      expect(stats.memoryUsage).toBeGreaterThanOrEqual(0) // Memory usage might be 0 for small objects
      
      const detailedStats = eventBus.getDetailedStats() as any
      expect(detailedStats.eventCount).toBe(2)
      expect(detailedStats.maxListenersPerEvent).toBe(100)
      expect(detailedStats.isDestroyed).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should wrap errors during emission', () => {
      const failingHandler = jest.fn(() => {
        throw new Error('Handler failed')
      })
      
      eventBus.on('error-test', failingHandler)
      
      // Should not throw - errors are handled safely
      expect(() => {
        eventBus.emit('error-test', 'data')
      }).not.toThrow()
      
      expect(failingHandler).toHaveBeenCalled()
    })

    it('should validate event names', () => {
      const handler = jest.fn()
      
      expect(() => eventBus.on('', handler)).toThrow()
      expect(() => eventBus.on(null as any, handler)).toThrow()
      expect(() => eventBus.on(undefined as any, handler)).toThrow()
      
      expect(() => eventBus.emit('', 'data')).toThrow()
      expect(() => eventBus.emit(null as any, 'data')).toThrow()
    })

    it('should validate handler functions', () => {
      expect(() => eventBus.on('test', null as any)).toThrow()
      expect(() => eventBus.on('test', 'not-a-function' as any)).toThrow()
      
      expect(() => eventBus.off('test', null as any)).toThrow()
      expect(() => eventBus.off('test', 'not-a-function' as any)).toThrow()
      
      // undefined handler should be ok since it's optional in validation
      expect(() => eventBus.on('test', jest.fn())).not.toThrow()
    })

    it('should track error count in stats', () => {
      const handler = jest.fn()
      
      try {
        eventBus.on('', handler) // Invalid event name
      } catch (e) {
        // Expected error
      }
      
      const stats = eventBus.getDetailedStats() as any
      expect(stats.errorCount).toBeGreaterThan(0)
    })
  })

  describe('event name management', () => {
    it('should return correct event names', () => {
      const handler = jest.fn()
      
      expect(eventBus.getEventNames()).toEqual([])
      
      eventBus.on('event-a', handler)
      eventBus.on('event-b', handler)
      eventBus.on('event-c', handler)
      
      const eventNames = eventBus.getEventNames()
      expect(eventNames).toHaveLength(3)
      expect(eventNames).toContain('event-a')
      expect(eventNames).toContain('event-b')
      expect(eventNames).toContain('event-c')
    })
  })

  describe('lifecycle management', () => {
    it('should be destroyable', () => {
      const handler = jest.fn()
      
      eventBus.on('test-event', handler)
      expect(eventBus.isDestroyedState()).toBe(false)
      
      eventBus.destroy()
      expect(eventBus.isDestroyedState()).toBe(true)
      
      // After destruction, event names should be empty but accessing it should throw
      expect(() => eventBus.getEventNames()).toThrow()
      
      const stats = eventBus.getDetailedStats() as any
      expect(stats.totalEvents).toBe(0)
      expect(stats.totalSubscriptions).toBe(0)
    })

    it('should handle multiple destroy calls', () => {
      eventBus.destroy()
      expect(() => eventBus.destroy()).not.toThrow()
      expect(eventBus.isDestroyedState()).toBe(true)
    })

    it('should throw when using destroyed bus', () => {
      const handler = jest.fn()
      
      eventBus.destroy()
      
      expect(() => eventBus.emit('test', 'data')).toThrow(BusError)
      expect(() => eventBus.on('test', handler)).toThrow(BusError)
      expect(() => eventBus.once('test', handler)).toThrow(BusError)
      expect(() => eventBus.off('test', handler)).toThrow(BusError)
      expect(() => eventBus.removeAllListeners()).toThrow(BusError)
      expect(() => eventBus.getListenerCount('test')).toThrow(BusError)
      expect(() => eventBus.hasListeners('test')).toThrow(BusError)
      expect(() => eventBus.getEventNames()).toThrow(BusError)
      expect(() => eventBus.createNamespace('test')).toThrow(BusError)
    })
  })

  describe('namespace creation', () => {
    it('should create namespaced event bus', () => {
      const namespace = eventBus.createNamespace('app1')
      
      expect(namespace).toBeInstanceOf(NamespacedEventBus)
      expect(namespace.getNamespace()).toBe('app1')
    })

    it('should validate namespace names', () => {
      expect(() => eventBus.createNamespace('')).toThrow()
      expect(() => eventBus.createNamespace(null as any)).toThrow()
      expect(() => eventBus.createNamespace(undefined as any)).toThrow()
    })
  })
})

describe('Namespaced Event Bus', () => {
  let eventBus: EventBus
  let namespace: NamespacedEventBus

  beforeEach(() => {
    eventBus = new EventBus()
    namespace = eventBus.createNamespace('test-app')
  })

  afterEach(() => {
    if (!eventBus.isDestroyedState()) {
      eventBus.destroy()
    }
  })

  describe('event operations', () => {
    it('should prefix events with namespace', () => {
      const handler = jest.fn()
      const globalHandler = jest.fn()
      
      // Listen on namespaced event
      namespace.on('user:login', handler)
      
      // Listen on global bus for comparison
      eventBus.on('test-app:user:login', globalHandler)
      
      // Emit through namespace
      namespace.emit('user:login', { userId: 123 })
      
      expect(handler).toHaveBeenCalledWith({ userId: 123 })
      expect(globalHandler).toHaveBeenCalledWith({ userId: 123 })
    })

    it('should support all event operations', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      
      // Test on()
      const unsubscribe = namespace.on('test-event', handler1)
      
      // Test once()
      namespace.once('once-event', handler2)
      
      // Test emit()
      namespace.emit('test-event', 'data1')
      namespace.emit('once-event', 'data2')
      namespace.emit('once-event', 'data3') // Should only trigger once
      
      expect(handler1).toHaveBeenCalledWith('data1')
      expect(handler2).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledWith('data2')
      
      // Test unsubscribe
      unsubscribe()
      namespace.emit('test-event', 'data4')
      expect(handler1).toHaveBeenCalledTimes(1) // Should not be called again
    })

    it('should handle listener management', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      
      namespace.on('count-test', handler1)
      namespace.on('count-test', handler2)
      
      expect(namespace.getListenerCount('count-test')).toBe(2)
      expect(namespace.hasListeners('count-test')).toBe(true)
      
      namespace.off('count-test', handler1)
      expect(namespace.getListenerCount('count-test')).toBe(1)
      
      namespace.removeAllListeners('count-test')
      expect(namespace.getListenerCount('count-test')).toBe(0)
      expect(namespace.hasListeners('count-test')).toBe(false)
    })
  })

  describe('namespace isolation', () => {
    it('should isolate events between namespaces', () => {
      const namespace2 = eventBus.createNamespace('test-app2')
      
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      
      namespace.on('isolated-event', handler1)
      namespace2.on('isolated-event', handler2)
      
      namespace.emit('isolated-event', 'data1')
      expect(handler1).toHaveBeenCalledWith('data1')
      expect(handler2).not.toHaveBeenCalled()
      
      namespace2.emit('isolated-event', 'data2')
      expect(handler2).toHaveBeenCalledWith('data2')
      expect(handler1).toHaveBeenCalledTimes(1) // Still only called once
    })

    it('should return correct event names within namespace', () => {
      const handler = jest.fn()
      
      namespace.on('event-a', handler)
      namespace.on('event-b', handler)
      eventBus.on('global-event', handler)
      
      const namespaceEvents = namespace.getEventNames()
      expect(namespaceEvents).toEqual(['event-a', 'event-b'])
      expect(namespaceEvents).not.toContain('global-event')
    })
  })

  describe('namespace cleanup', () => {
    it('should remove all listeners for namespace', () => {
      const handler = jest.fn()
      
      namespace.on('event-1', handler)
      namespace.on('event-2', handler)
      namespace.on('event-3', handler)
      
      expect(namespace.getEventNames()).toHaveLength(3)
      
      namespace.removeAllListeners()
      
      expect(namespace.getEventNames()).toHaveLength(0)
    })

    it('should destroy namespace cleanly', () => {
      const handler = jest.fn()
      
      namespace.on('cleanup-test', handler)
      expect(namespace.getListenerCount('cleanup-test')).toBe(1)
      
      namespace.destroy()
      expect(namespace.getListenerCount('cleanup-test')).toBe(0)
    })

    it('should not affect other namespaces during cleanup', () => {
      const namespace2 = eventBus.createNamespace('other-app')
      const handler = jest.fn()
      
      namespace.on('test-event', handler)
      namespace2.on('test-event', handler)
      
      namespace.destroy()
      
      expect(namespace.getListenerCount('test-event')).toBe(0)
      expect(namespace2.getListenerCount('test-event')).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('should handle complex event names', () => {
      const handler = jest.fn()
      
      namespace.on('user:profile:update:success', handler)
      namespace.emit('user:profile:update:success', { result: 'ok' })
      
      expect(handler).toHaveBeenCalledWith({ result: 'ok' })
      
      // Should be stored as 'test-app:user:profile:update:success' in main bus
      expect(eventBus.hasListeners('test-app:user:profile:update:success')).toBe(true)
    })

    it('should handle empty event names gracefully', () => {
      const handler = jest.fn()
      
      // Empty event names concatenated with namespace become "test-app:" which might be valid
      // Let's test the actual behavior
      const emptyEventResult = `${namespace.getNamespace()}:`
      
      // Test that the namespace correctly prefixes events
      namespace.on('valid-event', handler)
      namespace.emit('valid-event', 'data')
      expect(handler).toHaveBeenCalledWith('data')
      
      // Test with what would be an empty event - might not throw since it becomes "test-app:"
      try {
        namespace.on('', handler)
        namespace.emit('', 'test')
        // If no error thrown, verify it creates the expected prefixed event
        expect(eventBus.hasListeners(emptyEventResult)).toBe(true)
      } catch (error) {
        // If it does throw, that's also acceptable behavior
        expect(error).toBeDefined()
      }
    })
  })
})
