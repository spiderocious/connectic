/**
 * Custom error class for connectic
 */
export class ConnecticError extends Error {
  public readonly code: number | string = 500;

  constructor(message: string) {
    super(message);
    this.name = 'ConnecticError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConnecticError);
    }
  }
}

/**
 * Create a standardized error
 */
export function createError(message: string): ConnecticError {
  return new ConnecticError(message);
}


/**
 * connectic - Error Classes and Codes
 * 
 * This file defines all error types and status codes used throughout connectic.
 * Error codes follow HTTP status code conventions for familiarity.
 */

/**
 * Bus-specific error codes following HTTP status conventions
 */
export enum BusErrorCode {
  /** No responders available for the requested event */
  NOT_FOUND = 404,
  
  /** Middleware validation failed or access denied */
  FORBIDDEN = 403,
  
  /** Request timed out waiting for response */
  TIMEOUT = 408,
  
  /** Multiple responders when expecting single response */
  CONFLICT = 409,
  
  /** Event payload exceeds configured size limits */
  PAYLOAD_TOO_LARGE = 413,
  
  /** Rate limiting threshold exceeded */
  TOO_MANY_REQUESTS = 429,
  
  /** Internal bus error or unexpected failure */
  INTERNAL_ERROR = 500,
  
  /** Invalid request format or malformed event name */
  BAD_REQUEST = 400,
  
  /** Responder was available but is now offline/destroyed */
  GONE = 410,
  
  /** Responder exists but temporarily unavailable */
  SERVICE_UNAVAILABLE = 503,
  
  /** Payload structure valid but business logic rejects it */
  UNPROCESSABLE_ENTITY = 422
}

/**
 * Custom error class for all bus-related errors
 * Provides structured error information with specific error codes
 */
export class BusError extends Error {
  /**
   * Creates a new BusError instance
   * @param message Human-readable error description
   * @param busCode Specific error code for programmatic handling
   * @param details Additional error context and debugging information
   */
  constructor(
    message: string,
    public readonly busCode: BusErrorCode,
    public readonly details?: any
  ) {
    super(message)
    this.name = 'BusError'
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, BusError.prototype)
    
    // Capture stack trace if available (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BusError)
    }
  }

  /**
   * Returns a JSON representation of the error
   * Useful for logging and debugging
   */
  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      busCode: this.busCode,
      details: this.details,
      stack: this.stack
    }
  }

  /**
   * Returns a string representation including error code
   */
  override toString(): string {
    return `${this.name} [${this.busCode}]: ${this.message}`
  }

  /**
   * Check if this error indicates a temporary failure that might be retried
   */
  isRetryable(): boolean {
    return [
      BusErrorCode.TIMEOUT,
      BusErrorCode.TOO_MANY_REQUESTS,
      BusErrorCode.SERVICE_UNAVAILABLE,
      BusErrorCode.INTERNAL_ERROR
    ].includes(this.busCode)
  }

  /**
   * Check if this error indicates a client-side issue
   */
  isClientError(): boolean {
    return this.busCode >= 400 && this.busCode < 500
  }

  /**
   * Check if this error indicates a server-side issue
   */
  isServerError(): boolean {
    return this.busCode >= 500 && this.busCode < 600
  }
}

/**
 * Factory functions for creating common error types
 */
export class BusErrorFactory {
  /**
   * Creates a NOT_FOUND error when no responders are available
   */
  static notFound(event: string, details?: any): BusError {
    return new BusError(
      `No responders available for event: ${event}`,
      BusErrorCode.NOT_FOUND,
      { event, ...details }
    )
  }

  /**
   * Creates a TIMEOUT error when requests exceed timeout limit
   */
  static timeout(event: string, timeoutMs: number, details?: any): BusError {
    return new BusError(
      `Request timeout after ${timeoutMs}ms for event: ${event}`,
      BusErrorCode.TIMEOUT,
      { event, timeoutMs, ...details }
    )
  }

  /**
   * Creates a FORBIDDEN error when middleware validation fails
   */
  static forbidden(event: string, reason: string, details?: any): BusError {
    return new BusError(
      `Access forbidden for event: ${event}. Reason: ${reason}`,
      BusErrorCode.FORBIDDEN,
      { event, reason, ...details }
    )
  }

  /**
   * Creates a CONFLICT error when multiple responders exist
   */
  static conflict(event: string, responderCount: number, details?: any): BusError {
    return new BusError(
      `Multiple responders (${responderCount}) for event: ${event}`,
      BusErrorCode.CONFLICT,
      { event, responderCount, ...details }
    )
  }

  /**
   * Creates a PAYLOAD_TOO_LARGE error when payload exceeds limits
   */
  static payloadTooLarge(event: string, size: number, limit: number, details?: any): BusError {
    return new BusError(
      `Payload size ${size} bytes exceeds limit of ${limit} bytes for event: ${event}`,
      BusErrorCode.PAYLOAD_TOO_LARGE,
      { event, size, limit, ...details }
    )
  }

  /**
   * Creates a TOO_MANY_REQUESTS error when rate limiting is triggered
   */
  static tooManyRequests(event: string, limit: number, window: number, details?: any): BusError {
    return new BusError(
      `Rate limit exceeded: ${limit} requests per ${window}ms for event: ${event}`,
      BusErrorCode.TOO_MANY_REQUESTS,
      { event, limit, window, ...details }
    )
  }

  /**
   * Creates an INTERNAL_ERROR for unexpected failures
   */
  static internal(message: string, originalError?: Error, details?: any): BusError {
    return new BusError(
      `Internal error: ${message}`,
      BusErrorCode.INTERNAL_ERROR,
      { originalError: originalError?.message, stack: originalError?.stack, ...details }
    )
  }

  /**
   * Creates a BAD_REQUEST error for malformed requests
   */
  static badRequest(event: string, reason: string, details?: any): BusError {
    return new BusError(
      `Bad request for event: ${event}. ${reason}`,
      BusErrorCode.BAD_REQUEST,
      { event, reason, ...details }
    )
  }

  /**
   * Creates a GONE error when responder was available but is now offline
   */
  static gone(event: string, details?: any): BusError {
    return new BusError(
      `Responder for event: ${event} is no longer available`,
      BusErrorCode.GONE,
      { event, ...details }
    )
  }

  /**
   * Creates a SERVICE_UNAVAILABLE error for temporary responder issues
   */
  static serviceUnavailable(event: string, retryAfter?: number, details?: any): BusError {
    const message = retryAfter 
      ? `Service unavailable for event: ${event}. Retry after ${retryAfter}ms`
      : `Service temporarily unavailable for event: ${event}`
    
    return new BusError(
      message,
      BusErrorCode.SERVICE_UNAVAILABLE,
      { event, retryAfter, ...details }
    )
  }

  /**
   * Creates an UNPROCESSABLE_ENTITY error for valid but rejected payloads
   */
  static unprocessableEntity(event: string, reason: string, details?: any): BusError {
    return new BusError(
      `Unprocessable request for event: ${event}. ${reason}`,
      BusErrorCode.UNPROCESSABLE_ENTITY,
      { event, reason, ...details }
    )
  }
}

/**
 * Type guard to check if an error is a BusError
 */
export function isBusError(error: any): error is BusError {
  return error instanceof BusError
}

/**
 * Type guard to check if error has a specific bus error code
 */
export function hasBusErrorCode(error: any, code: BusErrorCode): error is BusError {
  return isBusError(error) && error.busCode === code
}

/**
 * Utility function to wrap unknown errors as BusError
 */
export function wrapError(error: unknown, event?: string): BusError {
  // Don't double-wrap BusErrors - preserve original error with context
  if (isBusError(error)) {
    // If it's already a BusError, just add context if missing
    if (event && !error.details?.event) {
      return new BusError(
        error.message,
        error.busCode,
        { ...error.details, event, wrappedFrom: event }
      );
    }
    return error;
  }

  if (error instanceof Error) {
    // Preserve original stack trace by not creating a new Error
    const busError = BusErrorFactory.internal(error.message, error, { event });
    // Preserve the original stack trace
    if (error.stack) {
      busError.stack = error.stack;
    }
    return busError;
  }

  return BusErrorFactory.internal(
    `Unknown error: ${String(error)}`,
    undefined,
    { event, originalError: error }
  );
}

/**
 * Error message templates for consistent error formatting
 */
export const ErrorMessages = {
  INVALID_EVENT_NAME: 'Event name must be a non-empty string',
  INVALID_PAYLOAD: 'Event payload must be serializable',
  INVALID_HANDLER: 'Event handler must be a function',
  INVALID_TIMEOUT: 'Timeout must be a positive number',
  INVALID_RETRIES: 'Retries must be a non-negative number',
  BUS_DESTROYED: 'Bus instance has been destroyed',
  MIDDLEWARE_ERROR: 'Middleware execution failed',
  CACHE_ERROR: 'Cache operation failed',
  STATE_NOT_FOUND: 'State key not found',
  COMPUTED_CIRCULAR_DEPENDENCY: 'Circular dependency detected in computed state'
} as const

/**
 * Helper function to create validation errors
 */
export function createValidationError(field: string, value: any, expected: string): BusError {
  return BusErrorFactory.badRequest(
    'validation',
    `Invalid ${field}: expected ${expected}, got ${typeof value}`,
    { field, value, expected }
  )
}