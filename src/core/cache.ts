/**
 * connectic - Cache Management
 *
 * This file implements intelligent caching for request/response patterns
 * with TTL, invalidation patterns, and multiple caching strategies.
 */

import { BusErrorFactory, wrapError } from '../errors';
import { CacheConfig, CacheEntry, CacheStrategy } from '../types';
import { createCacheKey, deepClone, estimateObjectSize } from './utils';

/**
 * Cache manager with TTL, LRU eviction, and pattern-based invalidation
 */
export class CacheManager {
  private cache = new Map<string, CacheEntry>();
  private config: Required<CacheConfig>;
  private cleanupTimer: NodeJS.Timeout | undefined;
  private accessOrder = new Map<string, number>();
  private accessCounter = 0;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
    invalidations: 0,
  };
  private isDestroyed = false;

  constructor(config: CacheConfig = {}) {
    this.config = {
      defaultTtl: config.defaultTtl || 300000, // 5 minutes
      maxSize: config.maxSize || 1000,
      strategy: config.strategy || 'cache-first',
    };

    this.startCleanupTimer();
  }

  /**
   * Gets a value from cache
   * @param key Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get(key: string): any {
    this.throwIfDestroyed();

    try {
      const entry = this.cache.get(key);

      if (!entry) {
        this.stats.misses++;
        return undefined;
      }

      // Check if expired
      if (Date.now() > entry.expiry) {
        this.cache.delete(key);
        this.stats.misses++;
        return undefined;
      }

      // Update last accessed time for LRU
      entry.lastAccessed = Date.now();
      // Move to end of Map for O(1) LRU tracking (re-insert for recency)
      this.accessOrder.delete(key);
      this.accessOrder.set(key, ++this.accessCounter);
      this.stats.hits++;

      return deepClone(entry.value);
    } catch (error) {
      throw wrapError(error, `cache.get:${key}`);
    }
  }

  /**
   * Sets a value in cache with optional TTL
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in milliseconds (optional)
   */
  set(key: string, value: any, ttl?: number): void {
    this.throwIfDestroyed();

    try {
      const actualTtl = ttl || this.config.defaultTtl;
      const expiry = Date.now() + actualTtl;

      // Create cache entry
      const entry: CacheEntry = {
        value: deepClone(value),
        expiry,
        lastAccessed: Date.now(),
      };

      // Check if we need to evict entries
      if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
        this.evictLRU();
      }

      this.cache.set(key, entry);
      // Move to end of Map for O(1) LRU tracking (re-insert for recency)
      this.accessOrder.delete(key);
      this.accessOrder.set(key, ++this.accessCounter);
      this.stats.sets++;
    } catch (error) {
      throw wrapError(error, `cache.set:${key}`);
    }
  }

  /**
   * Removes a specific cache entry
   * @param key Cache key to remove
   * @returns True if key was removed, false if not found
   */
  invalidate(key: string): boolean {
    this.throwIfDestroyed();

    try {
      const removed = this.cache.delete(key);
      if (removed) {
        this.stats.invalidations++;
      }
      return removed;
    } catch (error) {
      throw wrapError(error, `cache.invalidate:${key}`);
    }
  }

  /**
   * Removes cache entries matching a pattern
   * @param pattern Pattern to match (supports wildcards with *)
   * @returns Number of entries removed
   */
  invalidatePattern(pattern: string): number {
    this.throwIfDestroyed();

    try {
      const regex = this.patternToRegex(pattern);
      const keysToRemove: string[] = [];

      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => this.cache.delete(key));
      this.stats.invalidations += keysToRemove.length;

      return keysToRemove.length;
    } catch (error) {
      throw wrapError(error, `cache.invalidatePattern:${pattern}`);
    }
  }

  /**
   * Clears entire cache
   */
  clear(): void {
    this.throwIfDestroyed();

    try {
      const size = this.cache.size;
      this.cache.clear();
      this.stats.invalidations += size;
    } catch (error) {
      throw wrapError(error, 'cache.clear');
    }
  }

  /**
   * Gets current cache size
   * @returns Number of cached entries
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Gets cache statistics
   * @returns Cache statistics object
   */
  getStats(): object {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const memoryUsage = this.estimateMemoryUsage();

    return {
      ...this.stats,
      totalRequests,
      hitRate: Math.round(hitRate * 100) / 100,
      size: this.cache.size,
      maxSize: this.config.maxSize,
      memoryUsage,
      defaultTtl: this.config.defaultTtl,
      strategy: this.config.strategy,
      isDestroyed: this.isDestroyed,
    };
  }

  /**
   * Gets detailed cache information for debugging
   * @returns Detailed cache information
   */
  getDetailedInfo(): object {
    const entries: Record<string, any> = {};
    const now = Date.now();

    this.cache.forEach((entry, key) => {
      entries[key] = {
        isExpired: now > entry.expiry,
        ttl: Math.max(0, entry.expiry - now),
        lastAccessed: entry.lastAccessed,
        valueType: typeof entry.value,
        estimatedSize: estimateObjectSize(entry.value),
      };
    });

    return {
      entries,
      config: this.config,
      stats: this.getStats(),
    };
  }

  /**
   * Implements cache-aware request handling based on strategy
   * @param key Request cache key
   * @param networkFn Function to execute network request
   * @param strategy Caching strategy to use
   * @param ttl Custom TTL for this request
   * @returns Cached or fresh value
   */
  async handleRequest<T>(
    key: string,
    networkFn: () => Promise<T>,
    strategy: CacheStrategy = this.config.strategy,
    ttl?: number
  ): Promise<T> {
    this.throwIfDestroyed();

    try {
      switch (strategy) {
        case 'cache-first':
          return await this.cacheFirstStrategy(key, networkFn, ttl);

        case 'network-first':
          return await this.networkFirstStrategy(key, networkFn, ttl);

        case 'stale-while-revalidate':
          return await this.staleWhileRevalidateStrategy(key, networkFn, ttl);

        case 'cache-only':
          return await this.cacheOnlyStrategy(key);

        default:
          throw BusErrorFactory.badRequest(
            'cache.handleRequest',
            `Unknown cache strategy: ${strategy}`,
            { strategy, key }
          );
      }
    } catch (error) {
      throw wrapError(error, `cache.handleRequest:${key}:${strategy}`);
    }
  }

  /**
   * Creates a cache key for event and payload
   * @param event Event name
   * @param payload Request payload
   * @returns Cache key
   */
  createKey(event: string, payload?: any): string {
    return createCacheKey(event, payload);
  }

  /**
   * Destroys the cache manager and cleans up resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      this.stopCleanupTimer();
      this.cache.clear();
      this.isDestroyed = true;
    } catch (error) {
      this.isDestroyed = true;
      throw wrapError(error, 'cache.destroy');
    }
  }

  /**
   * Checks if cache manager is destroyed
   * @returns True if destroyed
   */
  isDestroyedState(): boolean {
    return this.isDestroyed;
  }

  /**
   * Cache-first strategy: return cache if available, otherwise network
   * @private
   */
  private async cacheFirstStrategy<T>(
    key: string,
    networkFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await networkFn();
    this.set(key, result, ttl);
    return result;
  }

  /**
   * Network-first strategy: try network first, fallback to cache
   * @private
   */
  private async networkFirstStrategy<T>(
    key: string,
    networkFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    try {
      const result = await networkFn();
      this.set(key, result, ttl);
      return result;
    } catch (error) {
      const cached = this.get(key);
      if (cached !== undefined) {
        return cached;
      }
      throw error;
    }
  }

  /**
   * Stale-while-revalidate strategy: return cache immediately, update in background
   * @private
   */
  private async staleWhileRevalidateStrategy<T>(
    key: string,
    networkFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get(key);

    // Start background revalidation
    networkFn()
      .then(result => {
        this.set(key, result, ttl);
      })
      .catch(error => {
        console.warn('Background revalidation failed:', error);
      });

    // Return cached value immediately if available
    if (cached !== undefined) {
      return cached;
    }

    // If no cache, wait for network
    const result = await networkFn();
    this.set(key, result, ttl);
    return result;
  }

  /**
   * Cache-only strategy: only return cached values, never go to network
   * @private
   */
  private async cacheOnlyStrategy<T>(key: string): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    throw BusErrorFactory.notFound(key, {
      message: 'No cached value available and cache-only strategy specified',
    });
  }

  /**
   * Evicts least recently used entries when cache is full
   * @private
   */
  private evictLRU(): void {
    if (this.accessOrder.size === 0) return;

    // Get the first (oldest) entry from accessOrder Map
    const oldestKey = this.accessOrder.keys().next().value;

    if (oldestKey && this.cache.has(oldestKey)) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Converts wildcard pattern to regex
   * @private
   */
  private patternToRegex(pattern: string): RegExp {
    // Escape special regex characters except *
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Convert * to .*
    const regexPattern = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Estimates total memory usage of cache
   * @private
   */
  private estimateMemoryUsage(): number {
    let total = 0;
    this.cache.forEach((entry, key) => {
      total += key.length * 2; // UTF-16 string
      total += estimateObjectSize(entry.value);
      total += 24; // Entry overhead (expiry, lastAccessed)
    });
    return total;
  }

  /**
   * Removes expired entries from cache
   * @private
   */
  private cleanup(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiry) {
          expiredKeys.push(key);
        }
      }

      expiredKeys.forEach(key => {
        this.cache.delete(key);
        this.stats.evictions++;
      });
    } catch (error) {
      console.warn('Cache cleanup failed:', error);
    }
  }

  /**
   * Starts the periodic cleanup timer
   * @private
   */
  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    this.cleanupTimer = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );

    // Don't prevent Node.js exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stops the cleanup timer
   * @private
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Throws error if cache manager is destroyed
   * @private
   */
  private throwIfDestroyed(): void {
    if (this.isDestroyed) {
      throw BusErrorFactory.gone('cache', 'Cache manager has been destroyed');
    }
  }
}

/**
 * Utility functions for cache management
 */
export class CacheUtils {
  /**
   * Creates a cache key with namespace prefix
   * @param namespace Namespace prefix
   * @param event Event name
   * @param payload Optional payload
   * @returns Namespaced cache key
   */
  static createNamespacedKey(
    namespace: string,
    event: string,
    payload?: any
  ): string {
    const baseKey = createCacheKey(event, payload);
    return `${namespace}:${baseKey}`;
  }

  /**
   * Extracts event name from cache key
   * @param key Cache key
   * @returns Event name or null if not extractable
   */
  static extractEventFromKey(key: string): string | null {
    const parts = key.split(':');
    return parts.length > 0 ? parts[0] : null;
  }

  /**
   * Estimates optimal TTL based on data characteristics
   * @param data Data to analyze
   * @returns Suggested TTL in milliseconds
   */
  static suggestTTL(data: any): number {
    const size = estimateObjectSize(data);

    // Larger objects get shorter TTL
    if (size > 100000) {
      // >100KB
      return 60000; // 1 minute
    } else if (size > 10000) {
      // >10KB
      return 300000; // 5 minutes
    } else {
      return 900000; // 15 minutes
    }
  }

  /**
   * Creates a cache warming function
   * @param cache Cache manager instance
   * @param keys Array of cache keys to warm
   * @param dataFetcher Function to fetch data for each key
   * @returns Promise that resolves when warming is complete
   */
  static async warmCache(
    cache: CacheManager,
    keys: string[],
    dataFetcher: (key: string) => Promise<any>
  ): Promise<void> {
    const promises = keys.map(async key => {
      try {
        const data = await dataFetcher(key);
        const ttl = this.suggestTTL(data);
        cache.set(key, data, ttl);
      } catch (error) {
        console.warn(`Failed to warm cache for key "${key}":`, error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Creates a cache key with versioning support
   * @param event Event name
   * @param payload Payload
   * @param version Version identifier
   * @returns Versioned cache key
   */
  static createVersionedKey(
    event: string,
    payload: any,
    version: string
  ): string {
    const baseKey = createCacheKey(event, payload);
    return `v${version}:${baseKey}`;
  }

  /**
   * Migrates cache entries from one version to another
   * @param cache Cache manager instance
   * @param oldVersion Old version identifier
   * @param newVersion New version identifier
   * @param migrator Function to migrate data
   * @returns Number of entries migrated
   */
  static migrateVersion(
    cache: CacheManager,
    oldVersion: string,
    newVersion: string,
    migrator: (oldData: any) => any
  ): number {
    const oldPrefix = `v${oldVersion}:`;
    const newPrefix = `v${newVersion}:`;
    let migrated = 0;

    // Get detailed cache info to access entries
    const info = cache.getDetailedInfo() as any;

    Object.keys(info.entries).forEach(key => {
      if (key.startsWith(oldPrefix)) {
        try {
          const oldData = cache.get(key);
          if (oldData !== undefined) {
            const newData = migrator(oldData);
            const newKey = key.replace(oldPrefix, newPrefix);
            cache.set(newKey, newData);
            cache.invalidate(key);
            migrated++;
          }
        } catch (error) {
          console.warn(`Failed to migrate cache entry "${key}":`, error);
        }
      }
    });

    return migrated;
  }
}
