/**
 * Tests for middleware.ts - Plugin and Middleware System
 */

import { MiddlewareManager, ResponderBuilder, BuiltinMiddleware } from '../../core/middleware'
import { EventBus } from '../../core/event-bus'
import { BusPlugin, MiddlewareFunction } from '../../types'
import { BusError } from '../../errors'

// Mock bus for testing
class MockBus {
  public hooks: Array<{ type: string; handler: Function }> = []
  
  addHook(type: string, handler: Function): void {
    this.hooks.push({ type, handler })
  }
  
  on(_event: string, _handler: Function): () => void {
    return () => {} // Mock unsubscribe
  }
}

describe('MiddlewareManager', () => {
  let middlewareManager: MiddlewareManager
  let mockBus: MockBus

  beforeEach(() => {
    mockBus = new MockBus()
    middlewareManager = new MiddlewareManager(mockBus as any)
  })

  afterEach(() => {
    middlewareManager.destroy()
  })

  describe('Plugin Management', () => {
    it('should add plugins successfully', () => {
      const plugin: BusPlugin = {
        name: 'test-plugin',
        install: jest.fn()
      }

      middlewareManager.addPlugin(plugin)

      expect(plugin.install).toHaveBeenCalledWith(mockBus)
      expect(middlewareManager.getPlugins()).toContain('test-plugin')
      expect(middlewareManager.hasPlugin('test-plugin')).toBe(true)
    })

    it('should prevent duplicate plugin names', () => {
      const plugin1: BusPlugin = {
        name: 'duplicate',
        install: jest.fn()
      }

      const plugin2: BusPlugin = {
        name: 'duplicate',
        install: jest.fn()
      }

      middlewareManager.addPlugin(plugin1)

      expect(() => {
        middlewareManager.addPlugin(plugin2)
      }).toThrow(BusError)
    })

    it('should validate plugin structure', () => {
      expect(() => {
        middlewareManager.addPlugin(null as any)
      }).toThrow(BusError)

      expect(() => {
        middlewareManager.addPlugin({ name: '' } as any)
      }).toThrow(BusError)

      expect(() => {
        middlewareManager.addPlugin({ name: 'test' } as any)
      }).toThrow(BusError)

      expect(() => {
        middlewareManager.addPlugin({ name: 'test', install: 'not-a-function' } as any)
      }).toThrow(BusError)
    })

    it('should remove plugins successfully', () => {
      const plugin: BusPlugin = {
        name: 'removable',
        install: jest.fn(),
        uninstall: jest.fn()
      }

      middlewareManager.addPlugin(plugin)
      expect(middlewareManager.hasPlugin('removable')).toBe(true)

      const removed = middlewareManager.removePlugin('removable')
      expect(removed).toBe(true)
      expect(plugin.uninstall).toHaveBeenCalledWith(mockBus)
      expect(middlewareManager.hasPlugin('removable')).toBe(false)
    })

    it('should handle plugin uninstall errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const plugin: BusPlugin = {
        name: 'error-plugin',
        install: jest.fn(),
        uninstall: jest.fn(() => {
          throw new Error('Uninstall failed')
        })
      }

      middlewareManager.addPlugin(plugin)
      middlewareManager.removePlugin('error-plugin')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error uninstalling plugin'),
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('should return false when removing non-existent plugin', () => {
      const removed = middlewareManager.removePlugin('non-existent')
      expect(removed).toBe(false)
    })
  })

  describe('Lifecycle Hooks', () => {
    it('should add and execute hooks', () => {
      const beforeEmitHandler = jest.fn()
      const afterEmitHandler = jest.fn()

      middlewareManager.addHook('beforeEmit', beforeEmitHandler)
      middlewareManager.addHook('afterEmit', afterEmitHandler)

      middlewareManager.runHooks('beforeEmit', 'test:event', { data: 'test' })
      middlewareManager.runHooks('afterEmit', 'test:event', { data: 'test' })

      expect(beforeEmitHandler).toHaveBeenCalledWith('test:event', { data: 'test' })
      expect(afterEmitHandler).toHaveBeenCalledWith('test:event', { data: 'test' })
    })

    it('should validate hook types', () => {
      expect(() => {
        middlewareManager.addHook('invalid' as any, jest.fn())
      }).toThrow(BusError)
    })

    it('should validate hook handlers', () => {
      expect(() => {
        middlewareManager.addHook('beforeEmit', 'not-a-function' as any)
      }).toThrow(BusError)
    })

    it('should remove specific hooks', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()

      middlewareManager.addHook('beforeEmit', handler1)
      middlewareManager.addHook('beforeEmit', handler2)

      middlewareManager.runHooks('beforeEmit', 'test', {})
      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)

      middlewareManager.removeHook('beforeEmit', handler1)
      middlewareManager.runHooks('beforeEmit', 'test', {})

      expect(handler1).toHaveBeenCalledTimes(1) // Not called again
      expect(handler2).toHaveBeenCalledTimes(2) // Called again
    })

    // it('should handle hook execution errors gracefully', () => {
    //   const goodHandler = jest.fn()
    //     const badHandler = jest.fn((e) => {
    //       console.error('Hook error:', e)
    //     throw new Error(`Hook error: ${e}`)
    //   })

    //   middlewareManager.addHook('beforeEmit', goodHandler)
    //   middlewareManager.addHook('beforeEmit', badHandler)

    //   // Should not throw, just log error
    //   expect(() => {
    //     middlewareManager.runHooks('beforeEmit', 'test', {})
    //   }).not.toThrow()

    //   expect(goodHandler).toHaveBeenCalled()
    //   expect(badHandler).toHaveBeenCalled()
    // })
  })

  describe('Statistics', () => {
    it('should return accurate statistics', () => {
      const plugin1: BusPlugin = { name: 'plugin1', install: jest.fn() }
      const plugin2: BusPlugin = { name: 'plugin2', install: jest.fn() }

      middlewareManager.addPlugin(plugin1)
      middlewareManager.addPlugin(plugin2)

      middlewareManager.addHook('beforeEmit', jest.fn())
      middlewareManager.addHook('afterEmit', jest.fn())
      middlewareManager.addHook('beforeEmit', jest.fn())

      const stats = middlewareManager.getStats()

      expect(stats).toEqual({
        pluginCount: 2,
        plugins: ['plugin1', 'plugin2'],
        hookCounts: {
          beforeEmit: 2,
          afterEmit: 1,
          beforeOn: 0,
          afterOn: 0
        },
        totalHooks: 3,
        isDestroyed: false
      })
    })
  })

  describe('Destruction', () => {
    it('should clean up all resources on destroy', () => {
      const plugin1: BusPlugin = {
        name: 'plugin1',
        install: jest.fn(),
        uninstall: jest.fn()
      }
      const plugin2: BusPlugin = {
        name: 'plugin2',
        install: jest.fn(),
        uninstall: jest.fn()
      }

      middlewareManager.addPlugin(plugin1)
      middlewareManager.addPlugin(plugin2)
      middlewareManager.addHook('beforeEmit', jest.fn())

      middlewareManager.destroy()

      expect(plugin1.uninstall).toHaveBeenCalled()
      expect(plugin2.uninstall).toHaveBeenCalled()
      expect(middlewareManager.getPlugins()).toEqual([])
      expect(middlewareManager.isDestroyedState()).toBe(true)
    })

    it('should prevent operations after destruction', () => {
      middlewareManager.destroy()

      expect(() => {
        middlewareManager.addPlugin({ name: 'test', install: jest.fn() })
      }).toThrow(BusError)

      expect(() => {
        middlewareManager.addHook('beforeEmit', jest.fn())
      }).toThrow(BusError)
    })
  })
})

describe('ResponderBuilder', () => {
  let eventBus: EventBus
  let responderBuilder: ResponderBuilder<any>

  beforeEach(() => {
    eventBus = new EventBus()
    responderBuilder = new ResponderBuilder('test:event', eventBus)
  })

  afterEach(() => {
    eventBus.destroy()
  })

  describe('Middleware Chain', () => {
    it('should execute middleware in correct order', async () => {
      const executionOrder: string[] = []

      const middleware1: MiddlewareFunction = (
        _payload: any, 
        next: () => void, 
        _cancel: (reason?: string) => void
      ) => {
        executionOrder.push('middleware1')
        next()
      }

      const middleware2: MiddlewareFunction = (
        _payload: any, 
        next: () => void, 
        _cancel: (reason?: string) => void
      ) => {
        executionOrder.push('middleware2')
        next()
      }

      const middleware3: MiddlewareFunction = (
        _payload: any, 
        next: () => void, 
        _cancel: (reason?: string) => void
      ) => {
        executionOrder.push('middleware3')
        next()
      }

      responderBuilder
        .use(middleware1)
        .use(middleware2)
        .use(middleware3)
        .handler((_payload: any) => {
          executionOrder.push('handler')
          return 'result'
        })

      // Trigger the responder
      eventBus.emit('test:event', { data: 'test' })

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(executionOrder).toEqual(['middleware1', 'middleware2', 'middleware3', 'handler'])
    })

    it('should handle async middleware', async () => {
      const executionOrder: string[] = []

      const asyncMiddleware: MiddlewareFunction = async (
        _payload: any, 
        next: () => void, 
        _cancel: (reason?: string) => void
      ) => {
        executionOrder.push('async-start')
        await new Promise(resolve => setTimeout(resolve, 10))
        executionOrder.push('async-end')
        next()
      }

      responderBuilder
        .use(asyncMiddleware)
        .handler((_payload: any) => {
          executionOrder.push('handler')
          return 'result'
        })

      eventBus.emit('test:event', { data: 'test' })

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(executionOrder).toEqual(['async-start', 'async-end', 'handler'])
    })


    it('should prevent multiple next() calls', async () => {
      const middleware: MiddlewareFunction = (
        _payload: any, 
        next: () => void, 
        _cancel: (reason?: string) => void
      ) => {
        next()
        next() // Second call should be ignored
      }

      responderBuilder
        .use(middleware)
        .handler(() => 'result')

      // Should not crash
      expect(() => {
        eventBus.emit('test:event', { data: 'test' })
      }).not.toThrow()
    })
  })

  describe('Builder Validation', () => {
    it('should validate middleware functions', () => {
      expect(() => {
        responderBuilder.use('not-a-function' as any)
      }).toThrow(BusError)
    })

    it('should validate handler functions', () => {
      expect(() => {
        responderBuilder.handler('not-a-function' as any)
      }).toThrow(BusError)
    })

    it('should prevent adding middleware after handler installation', () => {
      responderBuilder.handler(() => 'result')

      expect(() => {
        responderBuilder.use(jest.fn())
      }).toThrow(BusError)
    })

    it('should prevent installing handler twice', () => {
      responderBuilder.handler(() => 'result')

      expect(() => {
        responderBuilder.handler(() => 'another result')
      }).toThrow(BusError)
    })
  })

  describe('Builder Information', () => {
    it('should provide builder information', () => {
      const middleware = jest.fn()
      responderBuilder.use(middleware)

      let info = responderBuilder.getInfo()
      expect(info).toEqual({
        eventName: 'test:event',
        middlewareCount: 1,
        isInstalled: false,
        hasHandler: false
      })

      responderBuilder.handler(() => 'result')

      info = responderBuilder.getInfo()
      expect(info).toEqual({
        eventName: 'test:event',
        middlewareCount: 1,
        isInstalled: true,
        hasHandler: true
      })
    })
  })
})

describe('BuiltinMiddleware', () => {
  describe('Logger Middleware', () => {
    it('should log requests with payload', () => {
      const logs: string[] = []
      const logger = BuiltinMiddleware.logger({
        logPayload: true,
        prefix: '[TEST]'
      })

      const mockNext = jest.fn()
      const mockCancel = jest.fn()

      // Mock console.log
      const originalLog = console.log
      console.log = (message: string, data?: any) => {
        logs.push(data ? `${message} ${JSON.stringify(data)}` : message)
      }

      try {
        logger({ test: 'data' }, mockNext, mockCancel)

        expect(logs.length).toBe(1)
        expect(logs[0]).toContain('[TEST]')
        expect(logs[0]).toContain('test')
        expect(mockNext).toHaveBeenCalled()
      } finally {
        console.log = originalLog
      }
    })

    it('should log without payload when configured', () => {
      const logs: string[] = []
      const logger = BuiltinMiddleware.logger({
        logPayload: false,
        prefix: '[TEST]'
      })

      const mockNext = jest.fn()

      const originalLog = console.log
      console.log = (message: string) => logs.push(message)

      try {
        logger({ test: 'data' }, mockNext, jest.fn())

        expect(logs.length).toBe(1)
        expect(logs[0]).toContain('[TEST]')
        expect(logs[0]).not.toContain('test')
        expect(mockNext).toHaveBeenCalled()
      } finally {
        console.log = originalLog
      }
    })
  })

  describe('Validator Middleware', () => {
    it('should pass valid payloads', () => {
      const validator = BuiltinMiddleware.validator((payload: any) => {
        return payload.userId ? true : 'Missing userId'
      })

      const mockNext = jest.fn()
      const mockCancel = jest.fn()

      validator({ userId: '123' }, mockNext, mockCancel)

      expect(mockNext).toHaveBeenCalled()
      expect(mockCancel).not.toHaveBeenCalled()
    })

    it('should cancel invalid payloads', () => {
      const validator = BuiltinMiddleware.validator((payload: any) => {
        return payload.userId ? true : 'Missing userId'
      })

      const mockNext = jest.fn()
      const mockCancel = jest.fn()

      validator({ data: 'test' }, mockNext, mockCancel)

      expect(mockNext).not.toHaveBeenCalled()
      expect(mockCancel).toHaveBeenCalledWith('Missing userId')
    })

    it('should handle boolean validation results', () => {
      const validator = BuiltinMiddleware.validator(() => false)

      const mockNext = jest.fn()
      const mockCancel = jest.fn()

      validator({}, mockNext, mockCancel)

      expect(mockCancel).toHaveBeenCalledWith('Validation failed')
    })
  })

  describe('Rate Limit Middleware', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should allow requests within limit', () => {
      const rateLimit = BuiltinMiddleware.rateLimit({
        maxRequests: 5,
        windowMs: 60000
      })

      const mockNext = jest.fn()
      const mockCancel = jest.fn()

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        rateLimit({ key: 'user123' }, mockNext, mockCancel)
      }

      expect(mockNext).toHaveBeenCalledTimes(5)
      expect(mockCancel).not.toHaveBeenCalled()
    })

    it('should block requests exceeding limit', () => {
      const rateLimit = BuiltinMiddleware.rateLimit({
        maxRequests: 2,
        windowMs: 60000
      })

      const mockNext = jest.fn()
      const mockCancel = jest.fn()

      // Make 3 requests (exceeds limit of 2)
      for (let i = 0; i < 3; i++) {
        rateLimit({ key: 'user123' }, mockNext, mockCancel)
      }

      expect(mockNext).toHaveBeenCalledTimes(2)
      expect(mockCancel).toHaveBeenCalledTimes(1)
      expect(mockCancel).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded')
      )
    })

    it('should reset after time window', () => {
      const rateLimit = BuiltinMiddleware.rateLimit({
        maxRequests: 1,
        windowMs: 60000
      })

      const mockNext = jest.fn()
      const mockCancel = jest.fn()

      // First request
      rateLimit({ key: 'user123' }, mockNext, mockCancel)
      expect(mockNext).toHaveBeenCalledTimes(1)

      // Second request (should be blocked)
      rateLimit({ key: 'user123' }, mockNext, mockCancel)
      expect(mockCancel).toHaveBeenCalledTimes(1)

      // Fast-forward time
      jest.advanceTimersByTime(61000)

      // Third request (should be allowed after window reset)
      rateLimit({ key: 'user123' }, mockNext, mockCancel)
      expect(mockNext).toHaveBeenCalledTimes(2)
    })

    it('should handle different users separately', () => {
      const rateLimit = BuiltinMiddleware.rateLimit({
        maxRequests: 1,
        windowMs: 60000
      })

      const mockNext = jest.fn()
      const mockCancel = jest.fn()

      // User 1 request
      rateLimit({ key: 'user1' }, mockNext, mockCancel)
      expect(mockNext).toHaveBeenCalledTimes(1)

      // User 2 request (different user, should be allowed)
      rateLimit({ key: 'user2' }, mockNext, mockCancel)
      expect(mockNext).toHaveBeenCalledTimes(2)

      // User 1 second request (should be blocked)
      rateLimit({ key: 'user1' }, mockNext, mockCancel)
      expect(mockCancel).toHaveBeenCalledTimes(1)
    })
  })

  describe('Timeout Middleware', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should allow fast middleware', async () => {
      const timeout = BuiltinMiddleware.timeout(1000)

      const mockNext = jest.fn()
      const mockCancel = jest.fn()

      const middlewarePromise = timeout({}, mockNext, mockCancel)

      // Immediately resolve
      expect(mockNext).toHaveBeenCalled()

      await expect(middlewarePromise).resolves.toBeUndefined()
      expect(mockCancel).not.toHaveBeenCalled()
    })
  })
})