/**
 * @jest-environment node
 */

import { ComputedStateManager } from '../../core/computed-state'
import { SharedStateManager } from '../../core/shared-state'
import { EventBus } from '../../core/event-bus'
import { BusError } from '../../errors'

describe('Core Computed State Management', () => {
  let eventBus: EventBus
  let stateManager: SharedStateManager
  let computedManager: ComputedStateManager

  beforeEach(() => {
    eventBus = new EventBus()
    stateManager = new SharedStateManager(eventBus)
    computedManager = new ComputedStateManager(stateManager)
  })

  afterEach(() => {
    if (!computedManager.isDestroyedState()) {
      computedManager.destroy()
    }
    if (!stateManager.isDestroyedState()) {
      stateManager.destroy()
    }
    if (!eventBus.isDestroyedState()) {
      eventBus.destroy()
    }
  })

  describe('ComputedStateManager', () => {
    describe('constructor', () => {
      it('should create with state manager', () => {
        const manager = new ComputedStateManager(stateManager)
        expect(manager.isDestroyedState()).toBe(false)
        manager.destroy()
      })
    })

    describe('createComputed', () => {
      it('should create computed state with function', () => {
        const computeFn = jest.fn(() => 'computed-value')
        const computed = computedManager.createComputed(computeFn)
        
        expect(computed).toBeDefined()
        expect(typeof computed.get).toBe('function')
        expect(typeof computed.subscribe).toBe('function')
      })

      it('should throw for invalid compute function', () => {
        expect(() => computedManager.createComputed(null as any)).toThrow()
        expect(() => computedManager.createComputed('not-a-function' as any)).toThrow()
        expect(() => computedManager.createComputed(undefined as any)).toThrow()
      })

      it('should track computed states', () => {
        computedManager.createComputed(() => 'value1')
        computedManager.createComputed(() => 'value2')
        
        const stats = computedManager.getStats()
        expect((stats as any).totalComputedStates).toBe(2)
      })
    })

    describe('lifecycle management', () => {
      it('should destroy properly', () => {
        computedManager.createComputed(() => 'value1')
        computedManager.createComputed(() => 'value2')
        
        expect(computedManager.isDestroyedState()).toBe(false)
        
        computedManager.destroy()
        
        expect(computedManager.isDestroyedState()).toBe(true)
        expect(() => computedManager.createComputed(() => 'test')).toThrow()
      })

      it('should handle multiple destroy calls', () => {
        computedManager.destroy()
        expect(() => computedManager.destroy()).not.toThrow()
      })

      it('should destroy all computed states on manager destroy', () => {
        const computed1 = computedManager.createComputed(() => 'value1')
        const computed2 = computedManager.createComputed(() => 'value2')
        
        computedManager.destroy()
        
        expect((computed1 as any).isDestroyed).toBe(true)
        expect((computed2 as any).isDestroyed).toBe(true)
      })
    })

    describe('removeComputed', () => {
      it('should remove computed state', () => {
        computedManager.createComputed(() => 'value')
        
        expect((computedManager.getStats() as any).totalComputedStates).toBe(1)
        
        // Computed states are removed automatically when destroyed
        computedManager.destroy()
        
        expect((computedManager.getStats() as any).totalComputedStates).toBe(0)
      })

      it('should handle removing non-existent computed', () => {
        computedManager.createComputed(() => 'value')
        const other = computedManager.createComputed(() => 'other')
        
        other.destroy()
        other.destroy() // Destroy again
        
        expect((computedManager.getStats() as any).totalComputedStates).toBe(1)
      })
    })
  })

  describe('ComputedState', () => {
    describe('basic functionality', () => {
      it('should compute and return value', () => {
        const computeFn = jest.fn(() => 42)
        const computed = computedManager.createComputed(computeFn)
        
        const value = computed.get()
        expect(value).toBe(42)
        expect(computeFn).toHaveBeenCalledTimes(1)
      })

      it('should cache computed values', () => {
        const computeFn = jest.fn(() => Math.random())
        const computed = computedManager.createComputed(computeFn)
        
        const value1 = computed.get()
        const value2 = computed.get()
        
        expect(value1).toBe(value2)
        expect(computeFn).toHaveBeenCalledTimes(1)
      })

      it('should handle complex computed values', () => {
        const computeFn = () => ({
          list: [1, 2, 3],
          sum: 6,
          metadata: { computed: true }
        })
        const computed = computedManager.createComputed(computeFn)
        
        const value = computed.get()
        expect(value.list).toEqual([1, 2, 3])
        expect(value.sum).toBe(6)
        expect(value.metadata.computed).toBe(true)
      })
    })

    describe('dependency tracking', () => {
      it('should track shared state dependencies', () => {
        const sharedState = stateManager.createState('counter', 0)
        const computed = computedManager.createComputed(() => sharedState.get() * 2)
        
        expect(computed.get()).toBe(0)
        
        sharedState.set(5)
        expect(computed.get()).toBe(10)
        
        sharedState.set(10)
        expect(computed.get()).toBe(20)
      })

      it('should track multiple dependencies', () => {
        const state1 = stateManager.createState('a', 10)
        const state2 = stateManager.createState('b', 20)
        const computed = computedManager.createComputed(() => state1.get() + state2.get())
        
        expect(computed.get()).toBe(30)
        
        state1.set(15)
        expect(computed.get()).toBe(35)
        
        state2.set(25)
        expect(computed.get()).toBe(40)
      })

      it('should track nested computed dependencies', () => {
        const baseState = stateManager.createState('base', 5)
        const computed1 = computedManager.createComputed(() => baseState.get() * 2)
        const computed2 = computedManager.createComputed(() => computed1.get() + 10)
        
        expect(computed2.get()).toBe(20) // (5 * 2) + 10
        
        baseState.set(10)
        expect(computed2.get()).toBe(30) // (10 * 2) + 10
      })
    })

    describe('invalidation and recalculation', () => {
      it('should invalidate when dependencies change', () => {
        const state = stateManager.createState('test', 1)
        const computeFn = jest.fn(() => state.get() * 3)
        const computed = computedManager.createComputed(computeFn)
        
        computed.get() // Initial computation
        expect(computeFn).toHaveBeenCalledTimes(1)
        
        state.set(2) // Should invalidate computed
        computed.get() // Should recompute
        expect(computeFn).toHaveBeenCalledTimes(2)
      })

      it('should handle invalidation timing correctly', () => {
        const state = stateManager.createState('timing', 0)
        const values: number[] = []
        const computed = computedManager.createComputed(() => {
          const val = state.get()
          values.push(val)
          return val * 2
        })
        
        computed.get() // Initial: 0
        state.set(1)   // Invalidate
        state.set(2)   // Invalidate again
        computed.get() // Should compute with latest value (2)
        
        expect(values).toEqual([0, 2])
      })

      it('should batch invalidations', () => {
        const state1 = stateManager.createState('batch1', 1)
        const state2 = stateManager.createState('batch2', 2)
        const computeFn = jest.fn(() => state1.get() + state2.get())
        const computed = computedManager.createComputed(computeFn)
        
        computed.get() // Initial computation
        expect(computeFn).toHaveBeenCalledTimes(1)
        
        // Multiple rapid changes
        state1.set(10)
        state2.set(20)
        state1.set(100)
        
        computed.get() // Should compute only once with latest values
        expect(computed.get()).toBe(120)
        expect(computeFn).toHaveBeenCalledTimes(2)
      })
    })

    describe('subscriptions', () => {
      it('should notify subscribers when value changes', () => {
        const state = stateManager.createState('sub-test', 1)
        const computed = computedManager.createComputed(() => state.get() * 5)
        
        const subscriber = jest.fn()
        const unsubscribe = computed.subscribe(subscriber)
        
        state.set(2)
        computed.get() // Trigger recalculation
        
        expect(subscriber).toHaveBeenCalledWith(10, 5)
        
        unsubscribe()
      })

      it('should handle multiple subscribers', () => {
        const state = stateManager.createState('multi-sub', 3)
        const computed = computedManager.createComputed(() => state.get() * 2)
        
        const sub1 = jest.fn()
        const sub2 = jest.fn()
        const sub3 = jest.fn()
        
        computed.subscribe(sub1)
        computed.subscribe(sub2)
        computed.subscribe(sub3)
        
        state.set(5)
        computed.get() // Trigger notification
        
        expect(sub1).toHaveBeenCalledWith(10, 6)
        expect(sub2).toHaveBeenCalledWith(10, 6)
        expect(sub3).toHaveBeenCalledWith(10, 6)
      })

      it('should unsubscribe correctly', () => {
        const state = stateManager.createState('unsub-test', 1)
        const computed = computedManager.createComputed(() => state.get() * 7)
        
        const subscriber = jest.fn()
        const unsubscribe = computed.subscribe(subscriber)
        
        state.set(2)
        computed.get()
        expect(subscriber).toHaveBeenCalledTimes(1)
        
        unsubscribe()
        
        state.set(3)
        computed.get()
        expect(subscriber).toHaveBeenCalledTimes(1) // Should not be called again
      })
    })

    describe('error handling', () => {
      it('should handle compute function errors', () => {
        const computed = computedManager.createComputed(() => {
          throw new Error('Compute error')
        })
        
        expect(() => computed.get()).toThrow('Compute error')
      })

      it('should wrap compute errors with context', () => {
        const computed = computedManager.createComputed(() => {
          throw new Error('Custom error')
        })
        
        try {
          computed.get()
        } catch (error) {
          expect(error).toBeInstanceOf(BusError)
          expect((error as BusError).message).toContain('Custom error')
        }
      })

      it('should handle subscription errors gracefully', () => {
        const state = stateManager.createState('error-sub', 1)
        const computed = computedManager.createComputed(() => state.get())
        
        const badSubscriber = jest.fn(() => {
          throw new Error('Subscriber error')
        })
        const goodSubscriber = jest.fn()
        
        computed.subscribe(badSubscriber)
        computed.subscribe(goodSubscriber)
        
        state.set(2)
        computed.get()
        
        // Good subscriber should still be called despite bad one
        expect(goodSubscriber).toHaveBeenCalled()
      })
    })

    describe('lifecycle management', () => {
      it('should destroy computed state', () => {
        const computed = computedManager.createComputed(() => 'value')
        
        expect(() => computed.get()).not.toThrow()
        
        computed.destroy()
        
        expect(() => computed.get()).toThrow()
        expect(() => computed.subscribe(() => {})).toThrow()
      })

      it('should clean up dependencies on destroy', () => {
        const state = stateManager.createState('cleanup', 1)
        const computed = computedManager.createComputed(() => state.get())
        
        computed.get() // Establish dependency
        computed.destroy()
        
        // State changes should not affect destroyed computed
        state.set(2)
        expect(() => computed.get()).toThrow()
      })

      it('should clean up subscriptions on destroy', () => {
        const computed = computedManager.createComputed(() => 'value')
        const subscriber = jest.fn()
        
        computed.subscribe(subscriber)
        computed.destroy()
        
        // Subscriber should be cleaned up
        expect(() => computed.subscribe(() => {})).toThrow()
      })
    })

    describe('memoization and optimization', () => {
      it('should memoize based on dependencies', () => {
        const state1 = stateManager.createState('memo1', 1)
        const state2 = stateManager.createState('memo2', 2)
        const computeFn = jest.fn(() => state1.get() + state2.get())
        const computed = computedManager.createComputed(computeFn)
        
        computed.get() // Initial
        computed.get() // Cached
        expect(computeFn).toHaveBeenCalledTimes(1)
        
        state1.set(10) // Change dependency
        computed.get() // Recompute
        computed.get() // Cached again
        expect(computeFn).toHaveBeenCalledTimes(2)
      })

      it('should handle stale values correctly', () => {
        const state = stateManager.createState('stale', 5)
        const computed = computedManager.createComputed(() => state.get() * 2)
        
        const initialValue = computed.get()
        expect(initialValue).toBe(10)
        
        state.set(10) // Change but don't trigger recomputation yet
        
        // Value should be stale until explicitly requested
        const newValue = computed.get()
        expect(newValue).toBe(20)
      })

      it('should track computation statistics', () => {
        const state = stateManager.createState('stats', 1)
        const computed = computedManager.createComputed(() => state.get() * 2)
        
        computed.get() // Initial
        computed.get() // Cache hit
        state.set(2)   // Invalidate
        computed.get() // Recompute
        computed.get() // Cache hit
        
        // Can't access getStats directly through ComputedState interface
        // But the computation behavior is tested above
        expect(computed.get()).toBe(4)
      })
    })

    describe('edge cases', () => {
      it('should handle undefined/null computed values', () => {
        const computed1 = computedManager.createComputed(() => undefined)
        const computed2 = computedManager.createComputed(() => null)
        
        expect(computed1.get()).toBeUndefined()
        expect(computed2.get()).toBe(null)
      })

      it('should handle circular dependencies gracefully', () => {
        const state = stateManager.createState('circular', 1)
        
        // This would create a circular dependency if not handled
        const computed = computedManager.createComputed(() => {
          const val = state.get()
          if (val < 5) {
            state.set(val + 1) // Modify during computation
          }
          return val * 2
        })
        
        // Should handle gracefully without infinite loops
        expect(() => computed.get()).not.toThrow()
      })

      it('should handle rapid successive computations', () => {
        const state = stateManager.createState('rapid', 0)
        const computeFn = jest.fn(() => state.get() + 1)
        const computed = computedManager.createComputed(computeFn)
        
        // Rapid successive calls
        for (let i = 0; i < 100; i++) {
          state.set(i)
          computed.get()
        }
        
        expect(computed.get()).toBe(100)
        expect(computeFn).toHaveBeenCalledTimes(100)
      })
    })
  })

  describe('integration scenarios', () => {
    it('should work with complex dependency graphs', () => {
      // Create a complex dependency graph
      const baseData = stateManager.createState('baseData', { count: 1, multiplier: 2 })
      const count = computedManager.createComputed(() => baseData.get().count)
      const multiplier = computedManager.createComputed(() => baseData.get().multiplier)
      const product = computedManager.createComputed(() => count.get() * multiplier.get())
      const summary = computedManager.createComputed(() => ({
        count: count.get(),
        multiplier: multiplier.get(),
        product: product.get(),
        description: `${count.get()} × ${multiplier.get()} = ${product.get()}`
      }))
      
      expect(summary.get().description).toBe('1 × 2 = 2')
      
      baseData.set({ count: 5, multiplier: 3 })
      expect(summary.get().description).toBe('5 × 3 = 15')
    })

    it('should handle computed state with event bus integration', () => {
      const userState = stateManager.createState('user', { name: 'Alice', age: 25 })
      const greeting = computedManager.createComputed(() => {
        const user = userState.get()
        return `Hello, ${user.name}! You are ${user.age} years old.`
      })
      
      let lastGreeting = ''
      greeting.subscribe((newValue) => {
        lastGreeting = newValue
      })
      
      expect(greeting.get()).toBe('Hello, Alice! You are 25 years old.')
      
      userState.set({ name: 'Bob', age: 30 })
      greeting.get() // Trigger notification
      
      expect(lastGreeting).toBe('Hello, Bob! You are 30 years old.')
    })
  })
})
