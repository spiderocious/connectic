/**
 * connectic - Core Utilities
 *
 * This file contains internal utility functions used throughout connectic.
 * These utilities handle ID generation, validation, debouncing, and memory management.
 */

import { BusErrorFactory, createValidationError } from '../errors';

/**
 * Generates a unique correlation ID for request/response tracking
 * @param length Length of the random portion (default: 16)
 * @returns Unique string ID combining timestamp and random characters
 */
export function generateId(length: number = 16): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Array.from({ length }, () =>
    Math.random().toString(36).charAt(2)
  ).join('');

  return `${timestamp}_${randomPart}`;
}

/**
 * Validates event name format and constraints
 * @param name Event name to validate
 * @returns True if valid, false otherwise
 */
export function isValidEventName(name: any): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 255 &&
    !/^\s|\s$/.test(name)
  ); // No leading/trailing whitespace
}

/**
 * Validates that a value is a valid timeout duration
 * @param timeout Timeout value to validate
 * @returns True if valid timeout, false otherwise
 */
export function isValidTimeout(timeout: any): timeout is number {
  return (
    typeof timeout === 'number' &&
    timeout > 0 &&
    timeout <= Number.MAX_SAFE_INTEGER &&
    Number.isFinite(timeout)
  );
}

/**
 * Validates that a value is a valid retry count
 * @param retries Retry count to validate
 * @returns True if valid retry count, false otherwise
 */
export function isValidRetries(retries: any): retries is number {
  return (
    typeof retries === 'number' &&
    retries >= 0 &&
    retries <= 100 &&
    Number.isInteger(retries)
  );
}

/**
 * Validates that a value can be used as an event handler
 * @param handler Handler to validate
 * @returns True if valid handler, false otherwise
 */
export function isValidHandler(handler: any): handler is Function {
  return typeof handler === 'function';
}

/**
 * Creates a debounced version of a function
 * @param func Function to debounce
 * @param wait Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T {
  let timeout: NodeJS.Timeout | undefined;

  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };

  // Add cancel method to clear pending execution
  (debounced as any).cancel = () => {
    clearTimeout(timeout);
    timeout = undefined;
  };

  return debounced as T;
}

/**
 * Creates a throttled version of a function
 * @param func Function to throttle
 * @param limit Minimum time between executions in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): T {
  let inThrottle = false;

  const throttled = (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };

  return throttled as T;
}

/**
 * Deep clones an object using structured cloning when available,
 * falls back to JSON parse/stringify for older environments
 * @param obj Object to clone
 * @returns Deep clone of the object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Use structuredClone if available (modern browsers)
  if (typeof structuredClone !== 'undefined') {
    try {
      return structuredClone(obj);
    } catch {
      // Fall through to JSON method
    }
  }

  // Fallback to JSON clone (doesn't handle functions, undefined, symbols)
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    throw BusErrorFactory.internal(
      `Failed to clone object: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
      { originalObject: obj }
    );
  }
}

/**
 * Gets the global storage object for cross-application bus sharing
 * Handles different environments (browser, Node.js, Web Workers)
 * @returns Global storage Map instance
 */
export function getGlobalStore(): Map<string, any> {
  const REGISTRY_KEY = '__CONNECTIC_BUS_REGISTRY_v1__';

  // Try window first (browser main thread)
  if (typeof window !== 'undefined') {
    if (!(window as any)[REGISTRY_KEY]) {
      (window as any)[REGISTRY_KEY] = new Map();
    }
    return (window as any)[REGISTRY_KEY];
  }

  // Try global (Node.js, Web Workers)
  if (typeof global !== 'undefined') {
    if (!(global as any)[REGISTRY_KEY]) {
      (global as any)[REGISTRY_KEY] = new Map();
    }
    return (global as any)[REGISTRY_KEY];
  }

  // Try globalThis (universal)
  if (typeof globalThis !== 'undefined') {
    if (!(globalThis as any)[REGISTRY_KEY]) {
      (globalThis as any)[REGISTRY_KEY] = new Map();
    }
    return (globalThis as any)[REGISTRY_KEY];
  }

  // Last resort - module-level fallback
  if (!moduleStore) {
    moduleStore = new Map();
  }
  return moduleStore;
}

// Module-level fallback store
let moduleStore: Map<string, any>;

/**
 * Cleans up memory references to prevent memory leaks
 * @param obj Object to clean up
 */
export function cleanupMemoryReferences(obj: any): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  // Clear arrays
  if (Array.isArray(obj)) {
    obj.length = 0;
    return;
  }

  // Clear Maps
  if (obj instanceof Map) {
    obj.clear();
    return;
  }

  // Clear Sets
  if (obj instanceof Set) {
    obj.clear();
    return;
  }

  // Clear object properties
  try {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        delete obj[key];
      }
    }
  } catch {
    // Ignore errors for read-only objects
  }
}

/**
 * Safely executes a function with error handling
 * @param fn Function to execute
 * @param context Context description for error messages
 * @param fallbackValue Value to return on error
 * @returns Function result or fallback value
 */
export function safeExecute<T>(
  fn: () => T,
  context: string,
  fallbackValue?: T
): T | undefined {
  try {
    return fn();
  } catch (error) {
    console.warn(`Error in ${context}:`, error);
    return fallbackValue;
  }
}

/**
 * Safely executes an async function with error handling
 * @param fn Async function to execute
 * @param context Context description for error messages
 * @param fallbackValue Value to return on error
 * @returns Promise resolving to function result or fallback value
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  context: string,
  fallbackValue?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`Error in ${context}:`, error);
    return fallbackValue;
  }
}

/**
 * Checks if payload is serializable (can be sent across boundaries)
 * @param payload Payload to check
 * @returns True if serializable, false otherwise
 */
export function isSerializable(payload: any): boolean {
  try {
    JSON.stringify(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Estimates memory usage of an object in bytes
 * This is an approximation, not exact measurement
 * @param obj Object to measure
 * @returns Estimated size in bytes
 */
export function estimateObjectSize(obj: any): number {
  const seen = new WeakSet();

  function calculate(obj: any): number {
    if (obj === null || obj === undefined) {
      return 0;
    }

    if (typeof obj === 'boolean') {
      return 4;
    }

    if (typeof obj === 'number') {
      return 8;
    }

    if (typeof obj === 'string') {
      return obj.length * 2; // UTF-16
    }

    if (typeof obj === 'function') {
      return obj.toString().length * 2;
    }

    if (seen.has(obj)) {
      return 0; // Avoid circular references
    }

    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.reduce((size, item) => size + calculate(item), 0);
    }

    if (typeof obj === 'object') {
      return Object.keys(obj).reduce((size, key) => {
        return size + key.length * 2 + calculate(obj[key]);
      }, 0);
    }

    return 0;
  }

  return calculate(obj);
}

/**
 * Creates a hash code for a string (simple hash function)
 * @param str String to hash
 * @returns Numeric hash code
 */
export function hashString(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash);
}

/**
 * Creates a cache key from event name and payload
 * @param event Event name
 * @param payload Event payload
 * @returns Cache key string
 */
export function createCacheKey(event: string, payload?: any): string {
  if (!payload) {
    return event;
  }

  try {
    const payloadStr = JSON.stringify(payload);
    const hash = hashString(payloadStr);
    return `${event}:${hash}`;
  } catch {
    // Fallback if payload isn't serializable
    return `${event}:${Date.now()}`;
  }
}

/**
 * Validates input parameters and throws appropriate errors
 * @param event Event name
 * @param handler Optional handler function
 * @param timeout Optional timeout value
 * @param retries Optional retry count
 */
export function validateParameters(
  event: any,
  handler?: any,
  timeout?: any,
  retries?: any
): void {
  if (!isValidEventName(event)) {
    throw createValidationError('event', event, 'non-empty string');
  }

  if (handler !== undefined && !isValidHandler(handler)) {
    throw createValidationError('handler', handler, 'function');
  }

  if (timeout !== undefined && !isValidTimeout(timeout)) {
    throw createValidationError('timeout', timeout, 'positive number');
  }

  if (retries !== undefined && !isValidRetries(retries)) {
    throw createValidationError('retries', retries, 'non-negative integer');
  }
}

/**
 * Creates a delay promise for implementing timeouts and retries
 * @param ms Delay in milliseconds
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Implements exponential backoff for retry logic
 * @param attempt Current attempt number (0-based)
 * @param baseDelay Base delay in milliseconds
 * @param maxDelay Maximum delay in milliseconds
 * @returns Calculated delay for this attempt
 */
export function exponentialBackoff(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Checks if code is running in a browser environment
 * @returns True if in browser, false otherwise
 */
export function isBrowser(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.document !== 'undefined'
  );
}

/**
 * Checks if code is running in a Node.js environment
 * @returns True if in Node.js, false otherwise
 */
export function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null
  );
}

/**
 * Checks if code is running in a Web Worker
 * @returns True if in Web Worker, false otherwise
 */
// Declare importScripts for TypeScript to avoid "Cannot find name" error
declare const importScripts: Function | undefined;

export function isWebWorker(): boolean {
  return (
    typeof importScripts === 'function' &&
    typeof navigator !== 'undefined' &&
    typeof (navigator as any).userAgent === 'string'
  );
}
