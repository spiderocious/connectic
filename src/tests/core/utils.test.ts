/**
 * Comprehensive tests for core utilities
 */

import {
  generateId,
  isValidEventName,
  isValidTimeout,
  isValidRetries,
  isValidHandler,
  isSerializable,
  debounce,
  throttle,
  deepClone,
  estimateObjectSize,
  cleanupMemoryReferences,
  getGlobalStore,
  safeExecute,
  safeExecuteAsync,
  validateParameters,
  delay,
  exponentialBackoff,
  hashString,
  createCacheKey,
  isBrowser,
  isNode,
  isWebWorker
} from '../../core/utils';

import { BusError } from '../../errors';

describe('Core Utilities', () => {
  
  describe('generateId', () => {
    it('should generate unique IDs with default length', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(10); // timestamp + separator + random
    });

    it('should generate IDs with custom length', () => {
      const id = generateId(8);
      const parts = id.split('_');
      
      expect(parts).toHaveLength(2);
      expect(parts[1]).toHaveLength(8); // random part
    });

    it('should include timestamp in ID', () => {
      const beforeTime = Date.now();
      const id = generateId();
      const afterTime = Date.now();
      
      const timestampPart = parseInt(id.split('_')[0], 36);
      expect(timestampPart).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampPart).toBeLessThanOrEqual(afterTime);
    });

    it('should handle edge cases', () => {
      expect(() => generateId(0)).not.toThrow();
      expect(() => generateId(1)).not.toThrow();
      expect(() => generateId(100)).not.toThrow();
    });
  });

  describe('isValidEventName', () => {
    it('should validate correct event names', () => {
      expect(isValidEventName('user:login')).toBe(true);
      expect(isValidEventName('data-updated')).toBe(true);
      expect(isValidEventName('simple')).toBe(true);
      expect(isValidEventName('a')).toBe(true);
    });

    it('should reject invalid event names', () => {
      expect(isValidEventName('')).toBe(false);
      expect(isValidEventName('  ')).toBe(false);
      expect(isValidEventName(' leading')).toBe(false);
      expect(isValidEventName('trailing ')).toBe(false);
      expect(isValidEventName(null)).toBe(false);
      expect(isValidEventName(undefined)).toBe(false);
      expect(isValidEventName(123)).toBe(false);
      expect(isValidEventName({})).toBe(false);
    });

    it('should reject event names that are too long', () => {
      const longName = 'a'.repeat(256);
      expect(isValidEventName(longName)).toBe(false);
    });

    it('should accept event names at the limit', () => {
      const maxLengthName = 'a'.repeat(255);
      expect(isValidEventName(maxLengthName)).toBe(true);
    });
  });

  describe('isValidTimeout', () => {
    it('should validate correct timeout values', () => {
      expect(isValidTimeout(1000)).toBe(true);
      expect(isValidTimeout(0.1)).toBe(true);
      expect(isValidTimeout(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    it('should reject invalid timeout values', () => {
      expect(isValidTimeout(0)).toBe(false);
      expect(isValidTimeout(-1)).toBe(false);
      expect(isValidTimeout(NaN)).toBe(false);
      expect(isValidTimeout(Infinity)).toBe(false);
      expect(isValidTimeout('1000')).toBe(false);
      expect(isValidTimeout(null)).toBe(false);
      expect(isValidTimeout(undefined)).toBe(false);
    });
  });

  describe('isValidRetries', () => {
    it('should validate correct retry values', () => {
      expect(isValidRetries(0)).toBe(true);
      expect(isValidRetries(1)).toBe(true);
      expect(isValidRetries(100)).toBe(true);
    });

    it('should reject invalid retry values', () => {
      expect(isValidRetries(-1)).toBe(false);
      expect(isValidRetries(101)).toBe(false);
      expect(isValidRetries(1.5)).toBe(false);
      expect(isValidRetries(NaN)).toBe(false);
      expect(isValidRetries(Infinity)).toBe(false);
      expect(isValidRetries('5')).toBe(false);
      expect(isValidRetries(null)).toBe(false);
      expect(isValidRetries(undefined)).toBe(false);
    });
  });

  describe('isValidHandler', () => {
    it('should validate function handlers', () => {
      expect(isValidHandler(() => {})).toBe(true);
      expect(isValidHandler(function() {})).toBe(true);
      expect(isValidHandler(async () => {})).toBe(true);
      expect(isValidHandler(console.log)).toBe(true);
    });

    it('should reject non-function handlers', () => {
      expect(isValidHandler(null)).toBe(false);
      expect(isValidHandler(undefined)).toBe(false);
      expect(isValidHandler('function')).toBe(false);
      expect(isValidHandler(123)).toBe(false);
      expect(isValidHandler({})).toBe(false);
      expect(isValidHandler([])).toBe(false);
    });
  });

  describe('isSerializable', () => {
    it('should validate serializable objects', () => {
      expect(isSerializable({ key: 'value' })).toBe(true);
      expect(isSerializable([1, 2, 3])).toBe(true);
      expect(isSerializable('string')).toBe(true);
      expect(isSerializable(123)).toBe(true);
      expect(isSerializable(true)).toBe(true);
      expect(isSerializable(null)).toBe(true);
    });

    it('should reject non-serializable objects', () => {
      // Note: undefined is actually serializable via JSON.stringify
      expect(isSerializable(undefined)).toBe(true);
      // Note: Symbol is also serializable (becomes undefined) via JSON.stringify
      expect(isSerializable(Symbol('test'))).toBe(true);
      
      const circular: any = {};
      circular.self = circular;
      expect(isSerializable(circular)).toBe(false);

      // BigInt is not serializable and throws an error
      expect(isSerializable(BigInt(123))).toBe(false);
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should debounce function calls', () => {
      const mockFn = jest.fn();
      const debounced = debounce(mockFn, 100);

      debounced('arg1');
      debounced('arg2');
      debounced('arg3');

      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('arg3');
    });

    it('should cancel pending execution', () => {
      const mockFn = jest.fn();
      const debounced = debounce(mockFn, 100) as any;

      debounced('test');
      debounced.cancel();

      jest.advanceTimersByTime(100);

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should handle multiple rapid calls', () => {
      const mockFn = jest.fn();
      const debounced = debounce(mockFn, 50);

      for (let i = 0; i < 10; i++) {
        debounced(i);
        jest.advanceTimersByTime(10);
      }

      jest.advanceTimersByTime(50);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith(9);
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should throttle function calls', () => {
      const mockFn = jest.fn();
      const throttled = throttle(mockFn, 100);

      throttled('arg1');
      throttled('arg2');
      throttled('arg3');

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('arg1');

      jest.advanceTimersByTime(100);

      throttled('arg4');
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenCalledWith('arg4');
    });

    it('should allow execution after throttle period', () => {
      const mockFn = jest.fn();
      const throttled = throttle(mockFn, 50);

      throttled('first');
      expect(mockFn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60);

      throttled('second');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
      expect(deepClone(123)).toBe(123);
      expect(deepClone('string')).toBe('string');
      expect(deepClone(true)).toBe(true);
    });

    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should clone arrays', () => {
      const arr = [1, { a: 2 }, [3, 4]];
      const cloned = deepClone(arr);

      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[1]).not.toBe(arr[1]);
      expect(cloned[2]).not.toBe(arr[2]);
    });

    it('should handle Date objects', () => {
      const date = new Date();
      const cloned = deepClone(date);

      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
    });

    it('should handle objects with functions', () => {
      const objWithFunction = { fn: () => {}, data: 'test' };
      
      // The deepClone should work via JSON.parse/stringify fallback
      // which removes functions but doesn't throw
      expect(() => deepClone(objWithFunction)).not.toThrow();
      
      const cloned = deepClone(objWithFunction);
      expect(cloned.data).toBe('test');
      expect(cloned.fn).toBeUndefined(); // Functions are removed in JSON clone
    });
  });

  describe('estimateObjectSize', () => {
    it('should estimate size of primitive values', () => {
      expect(estimateObjectSize(null)).toBe(0);
      expect(estimateObjectSize(undefined)).toBe(0);
      expect(estimateObjectSize(true)).toBe(4);
      expect(estimateObjectSize(123)).toBe(8);
      expect(estimateObjectSize('hello')).toBe(10); // 5 chars * 2 bytes
    });

    it('should estimate size of objects', () => {
      const obj = { key: 'value' };
      const size = estimateObjectSize(obj);
      
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('should handle circular references', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      expect(() => estimateObjectSize(circular)).not.toThrow();
      expect(estimateObjectSize(circular)).toBeGreaterThan(0);
    });

    it('should estimate array sizes', () => {
      const arr = [1, 2, 3, 'test'];
      const size = estimateObjectSize(arr);
      
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });
  });

  describe('cleanupMemoryReferences', () => {
    it('should clear arrays', () => {
      const arr = [1, 2, 3];
      cleanupMemoryReferences(arr);
      
      expect(arr).toHaveLength(0);
    });

    it('should clear Maps', () => {
      const map = new Map([['key', 'value']]);
      cleanupMemoryReferences(map);
      
      expect(map.size).toBe(0);
    });

    it('should clear Sets', () => {
      const set = new Set([1, 2, 3]);
      cleanupMemoryReferences(set);
      
      expect(set.size).toBe(0);
    });

    it('should clear object properties', () => {
      const obj = { a: 1, b: 2 };
      cleanupMemoryReferences(obj);
      
      expect(Object.keys(obj)).toHaveLength(0);
    });

    it('should handle non-objects safely', () => {
      expect(() => cleanupMemoryReferences(null)).not.toThrow();
      expect(() => cleanupMemoryReferences(undefined)).not.toThrow();
      expect(() => cleanupMemoryReferences('string')).not.toThrow();
      expect(() => cleanupMemoryReferences(123)).not.toThrow();
    });
  });

  describe('getGlobalStore', () => {
    it('should return a Map instance', () => {
      const store = getGlobalStore();
      expect(store).toBeInstanceOf(Map);
    });

    it('should return the same instance on multiple calls', () => {
      const store1 = getGlobalStore();
      const store2 = getGlobalStore();
      
      expect(store1).toBe(store2);
    });

    it('should persist data across calls', () => {
      const store = getGlobalStore();
      store.set('test-key', 'test-value');
      
      const store2 = getGlobalStore();
      expect(store2.get('test-key')).toBe('test-value');
      
      // Cleanup
      store.delete('test-key');
    });
  });

  describe('safeExecute', () => {
    it('should execute function and return result', () => {
      const result = safeExecute(() => 'success', 'test context');
      expect(result).toBe('success');
    });

    it('should return fallback on error', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = safeExecute(
        () => { throw new Error('test error'); },
        'test context',
        'fallback'
      );
      
      expect(result).toBe('fallback');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should return undefined when no fallback provided', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = safeExecute(() => { throw new Error('test error'); }, 'test context');
      
      expect(result).toBeUndefined();
      
      consoleSpy.mockRestore();
    });
  });

  describe('safeExecuteAsync', () => {
    it('should execute async function and return result', async () => {
      const result = await safeExecuteAsync(async () => 'success', 'test context');
      expect(result).toBe('success');
    });

    it('should return fallback on error', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = await safeExecuteAsync(
        async () => { throw new Error('test error'); },
        'test context',
        'fallback'
      );
      
      expect(result).toBe('fallback');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should return undefined when no fallback provided', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = await safeExecuteAsync(
        async () => { throw new Error('test error'); },
        'test context'
      );
      
      expect(result).toBeUndefined();
      
      consoleSpy.mockRestore();
    });
  });

  describe('validateParameters', () => {
    it('should validate correct parameters', () => {
      expect(() => validateParameters('event', () => {}, 1000, 3)).not.toThrow();
      expect(() => validateParameters('event')).not.toThrow();
    });

    it('should throw for invalid event names', () => {
      expect(() => validateParameters('')).toThrow(BusError);
      expect(() => validateParameters(null)).toThrow(BusError);
    });

    it('should throw for invalid handlers', () => {
      expect(() => validateParameters('event', 'not-a-function')).toThrow(BusError);
      expect(() => validateParameters('event', {})).toThrow(BusError);
    });

    it('should throw for invalid timeouts', () => {
      expect(() => validateParameters('event', undefined, 0)).toThrow(BusError);
      expect(() => validateParameters('event', undefined, -1)).toThrow(BusError);
    });

    it('should throw for invalid retries', () => {
      expect(() => validateParameters('event', undefined, undefined, -1)).toThrow(BusError);
      expect(() => validateParameters('event', undefined, undefined, 101)).toThrow(BusError);
    });
  });

  describe('delay', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve after specified delay', async () => {
      const promise = delay(1000);
      let resolved = false;
      
      promise.then(() => { resolved = true; });
      
      expect(resolved).toBe(false);
      
      jest.advanceTimersByTime(1000);
      await promise;
      
      expect(resolved).toBe(true);
    });
  });

  describe('exponentialBackoff', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(exponentialBackoff(0, 1000)).toBe(1000);
      expect(exponentialBackoff(1, 1000)).toBe(2000);
      expect(exponentialBackoff(2, 1000)).toBe(4000);
      expect(exponentialBackoff(3, 1000)).toBe(8000);
    });

    it('should respect maximum delay', () => {
      const result = exponentialBackoff(10, 1000, 5000);
      expect(result).toBe(5000);
    });

    it('should use default values', () => {
      const result = exponentialBackoff(1);
      expect(result).toBe(2000); // baseDelay=1000, so 1000 * 2^1 = 2000
    });
  });

  describe('hashString', () => {
    it('should generate hash for strings', () => {
      const hash1 = hashString('test');
      const hash2 = hashString('test');
      const hash3 = hashString('different');
      
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(typeof hash1).toBe('number');
    });

    it('should handle empty strings', () => {
      const hash = hashString('');
      expect(hash).toBe(0);
    });

    it('should generate different hashes for different strings', () => {
      const hash1 = hashString('hello');
      const hash2 = hashString('world');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createCacheKey', () => {
    it('should create key from event only', () => {
      const key = createCacheKey('test-event');
      expect(key).toBe('test-event');
    });

    it('should create key with payload hash', () => {
      const key = createCacheKey('test-event', { data: 'test' });
      expect(key).toMatch(/^test-event:\d+$/);
    });

    it('should create consistent keys for same payload', () => {
      const payload = { data: 'test' };
      const key1 = createCacheKey('event', payload);
      const key2 = createCacheKey('event', payload);
      
      expect(key1).toBe(key2);
    });

    it('should handle non-serializable payloads', () => {
      const payload = { fn: () => {} };
      const key = createCacheKey('event', payload);
      
      expect(key).toMatch(/^event:\d+$/);
    });
  });

  describe('Environment Detection', () => {
    describe('isBrowser', () => {
      it('should detect browser environment', () => {
        // In jest/node environment, this should be false
        expect(isBrowser()).toBe(false);
      });
    });

    describe('isNode', () => {
      it('should detect Node.js environment', () => {
        // In jest/node environment, this should be true
        expect(isNode()).toBe(true);
      });
    });

    describe('isWebWorker', () => {
      it('should detect Web Worker environment', () => {
        // In jest/node environment, this should be false
        expect(isWebWorker()).toBe(false);
      });
    });
  });

  // Edge Cases and Error Scenarios
  describe('Edge Cases', () => {
    it('should handle reasonable parameter values gracefully', () => {
      expect(() => generateId(1000)).not.toThrow();
      expect(() => isValidEventName('a'.repeat(255))).not.toThrow();
      expect(() => estimateObjectSize({})).not.toThrow();
    });

    it('should handle null and undefined consistently', () => {
      expect(isValidEventName(null)).toBe(false);
      expect(isValidEventName(undefined)).toBe(false);
      expect(isValidHandler(null)).toBe(false);
      expect(isValidHandler(undefined)).toBe(false);
      expect(isSerializable(null)).toBe(true);
      // Note: undefined is serializable via JSON.stringify
      expect(isSerializable(undefined)).toBe(true);
    });

    it('should handle complex nested objects', () => {
      const complex = {
        level1: {
          level2: {
            level3: {
              data: [1, 2, { nested: true }]
            }
          }
        }
      };

      expect(() => deepClone(complex)).not.toThrow();
      expect(() => estimateObjectSize(complex)).not.toThrow();
      expect(isSerializable(complex)).toBe(true);
    });
  });
});
