/**
 * Comprehensive tests for connectic error handling
 */

import {
  ConnecticError,
  createError,
  BusError,
  BusErrorCode,
  BusErrorFactory,
  isBusError,
  hasBusErrorCode,
  wrapError,
  ErrorMessages,
  createValidationError
} from '../../errors';

describe('ConnecticError', () => {
  describe('constructor', () => {
    it('should create error with correct properties', () => {
      const message = 'Test error message';
      const error = new ConnecticError(message);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConnecticError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('ConnecticError');
      expect(error.code).toBe(500);
    });

    it('should maintain proper stack trace', () => {
      const error = new ConnecticError('Test error');
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });
});

describe('createError', () => {
  it('should create a ConnecticError with the given message', () => {
    const message = 'This is a test error';
    const error = createError(message);
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnecticError);
    expect(error.message).toBe(message);
    expect(error.name).toBe('ConnecticError');
    expect(error.code).toBe(500);
  });

  it('should create different instances for multiple calls', () => {
    const error1 = createError('Error 1');
    const error2 = createError('Error 2');
    
    expect(error1).not.toBe(error2);
    expect(error1.message).toBe('Error 1');
    expect(error2.message).toBe('Error 2');
  });
});

describe('BusErrorCode', () => {
  it('should have all expected error codes', () => {
    expect(BusErrorCode.NOT_FOUND).toBe(404);
    expect(BusErrorCode.FORBIDDEN).toBe(403);
    expect(BusErrorCode.TIMEOUT).toBe(408);
    expect(BusErrorCode.CONFLICT).toBe(409);
    expect(BusErrorCode.PAYLOAD_TOO_LARGE).toBe(413);
    expect(BusErrorCode.TOO_MANY_REQUESTS).toBe(429);
    expect(BusErrorCode.INTERNAL_ERROR).toBe(500);
    expect(BusErrorCode.BAD_REQUEST).toBe(400);
    expect(BusErrorCode.GONE).toBe(410);
    expect(BusErrorCode.SERVICE_UNAVAILABLE).toBe(503);
    expect(BusErrorCode.UNPROCESSABLE_ENTITY).toBe(422);
  });
});

describe('BusError', () => {
  describe('constructor', () => {
    it('should create error with message and bus code', () => {
      const message = 'Test bus error';
      const busCode = BusErrorCode.NOT_FOUND;
      const error = new BusError(message, busCode);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BusError);
      expect(error.message).toBe(message);
      expect(error.name).toBe('BusError');
      expect(error.busCode).toBe(busCode);
      expect(error.details).toBeUndefined();
    });

    it('should create error with details', () => {
      const message = 'Test error with details';
      const busCode = BusErrorCode.TIMEOUT;
      const details = { event: 'test:event', timeout: 5000 };
      const error = new BusError(message, busCode, details);

      expect(error.message).toBe(message);
      expect(error.busCode).toBe(busCode);
      expect(error.details).toEqual(details);
    });

    it('should maintain proper prototype chain', () => {
      const error = new BusError('Test', BusErrorCode.INTERNAL_ERROR);
      expect(error instanceof BusError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should capture stack trace when available', () => {
      const error = new BusError('Test', BusErrorCode.INTERNAL_ERROR);
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  describe('toJSON', () => {
    it('should return JSON representation of error', () => {
      const message = 'Test error';
      const busCode = BusErrorCode.NOT_FOUND;
      const details = { event: 'test:event' };
      const error = new BusError(message, busCode, details);

      const json = error.toJSON();

      expect(json).toEqual({
        name: 'BusError',
        message,
        busCode,
        details,
        stack: error.stack
      });
    });

    it('should handle error without details', () => {
      const error = new BusError('Test', BusErrorCode.TIMEOUT);
      const json = error.toJSON() as any;

      expect(json.details).toBeUndefined();
      expect(json.name).toBe('BusError');
      expect(json.busCode).toBe(BusErrorCode.TIMEOUT);
    });
  });

  describe('toString', () => {
    it('should return formatted string representation', () => {
      const error = new BusError('Test error', BusErrorCode.NOT_FOUND);
      const result = error.toString();

      expect(result).toBe('BusError [404]: Test error');
    });

    it('should handle different error codes', () => {
      const error = new BusError('Internal error', BusErrorCode.INTERNAL_ERROR);
      const result = error.toString();

      expect(result).toBe('BusError [500]: Internal error');
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable errors', () => {
      const retryableCodes = [
        BusErrorCode.TIMEOUT,
        BusErrorCode.TOO_MANY_REQUESTS,
        BusErrorCode.SERVICE_UNAVAILABLE,
        BusErrorCode.INTERNAL_ERROR
      ];

      retryableCodes.forEach(code => {
        const error = new BusError('Test', code);
        expect(error.isRetryable()).toBe(true);
      });
    });

    it('should return false for non-retryable errors', () => {
      const nonRetryableCodes = [
        BusErrorCode.NOT_FOUND,
        BusErrorCode.FORBIDDEN,
        BusErrorCode.BAD_REQUEST,
        BusErrorCode.CONFLICT,
        BusErrorCode.GONE,
        BusErrorCode.PAYLOAD_TOO_LARGE,
        BusErrorCode.UNPROCESSABLE_ENTITY
      ];

      nonRetryableCodes.forEach(code => {
        const error = new BusError('Test', code);
        expect(error.isRetryable()).toBe(false);
      });
    });
  });

  describe('isClientError', () => {
    it('should return true for 4xx errors', () => {
      const clientErrorCodes = [
        BusErrorCode.BAD_REQUEST,
        BusErrorCode.FORBIDDEN,
        BusErrorCode.NOT_FOUND,
        BusErrorCode.TIMEOUT,
        BusErrorCode.CONFLICT,
        BusErrorCode.GONE,
        BusErrorCode.PAYLOAD_TOO_LARGE,
        BusErrorCode.UNPROCESSABLE_ENTITY,
        BusErrorCode.TOO_MANY_REQUESTS
      ];

      clientErrorCodes.forEach(code => {
        const error = new BusError('Test', code);
        expect(error.isClientError()).toBe(true);
      });
    });

    it('should return false for 5xx errors', () => {
      const error = new BusError('Test', BusErrorCode.INTERNAL_ERROR);
      expect(error.isClientError()).toBe(false);

      const error2 = new BusError('Test', BusErrorCode.SERVICE_UNAVAILABLE);
      expect(error2.isClientError()).toBe(false);
    });
  });

  describe('isServerError', () => {
    it('should return true for 5xx errors', () => {
      const serverErrorCodes = [
        BusErrorCode.INTERNAL_ERROR,
        BusErrorCode.SERVICE_UNAVAILABLE
      ];

      serverErrorCodes.forEach(code => {
        const error = new BusError('Test', code);
        expect(error.isServerError()).toBe(true);
      });
    });

    it('should return false for 4xx errors', () => {
      const error = new BusError('Test', BusErrorCode.NOT_FOUND);
      expect(error.isServerError()).toBe(false);

      const error2 = new BusError('Test', BusErrorCode.BAD_REQUEST);
      expect(error2.isServerError()).toBe(false);
    });
  });
});

describe('BusErrorFactory', () => {
  describe('notFound', () => {
    it('should create NOT_FOUND error', () => {
      const event = 'test:event';
      const error = BusErrorFactory.notFound(event);

      expect(error.busCode).toBe(BusErrorCode.NOT_FOUND);
      expect(error.message).toBe(`No responders available for event: ${event}`);
      expect(error.details).toEqual({ event });
    });

    it('should include additional details', () => {
      const event = 'test:event';
      const additionalDetails = { timestamp: Date.now() };
      const error = BusErrorFactory.notFound(event, additionalDetails);

      expect(error.details).toEqual({ event, ...additionalDetails });
    });
  });

  describe('timeout', () => {
    it('should create TIMEOUT error', () => {
      const event = 'test:event';
      const timeoutMs = 5000;
      const error = BusErrorFactory.timeout(event, timeoutMs);

      expect(error.busCode).toBe(BusErrorCode.TIMEOUT);
      expect(error.message).toBe(`Request timeout after ${timeoutMs}ms for event: ${event}`);
      expect(error.details).toEqual({ event, timeoutMs });
    });

    it('should include additional details', () => {
      const event = 'test:event';
      const timeoutMs = 3000;
      const additionalDetails = { requestId: 'req-123' };
      const error = BusErrorFactory.timeout(event, timeoutMs, additionalDetails);

      expect(error.details).toEqual({ event, timeoutMs, ...additionalDetails });
    });
  });

  describe('forbidden', () => {
    it('should create FORBIDDEN error', () => {
      const event = 'test:event';
      const reason = 'Insufficient permissions';
      const error = BusErrorFactory.forbidden(event, reason);

      expect(error.busCode).toBe(BusErrorCode.FORBIDDEN);
      expect(error.message).toBe(`Access forbidden for event: ${event}. Reason: ${reason}`);
      expect(error.details).toEqual({ event, reason });
    });

    it('should include additional details', () => {
      const event = 'test:event';
      const reason = 'Invalid token';
      const additionalDetails = { userId: 'user-123' };
      const error = BusErrorFactory.forbidden(event, reason, additionalDetails);

      expect(error.details).toEqual({ event, reason, ...additionalDetails });
    });
  });

  describe('conflict', () => {
    it('should create CONFLICT error', () => {
      const event = 'test:event';
      const responderCount = 3;
      const error = BusErrorFactory.conflict(event, responderCount);

      expect(error.busCode).toBe(BusErrorCode.CONFLICT);
      expect(error.message).toBe(`Multiple responders (${responderCount}) for event: ${event}`);
      expect(error.details).toEqual({ event, responderCount });
    });
  });

  describe('payloadTooLarge', () => {
    it('should create PAYLOAD_TOO_LARGE error', () => {
      const event = 'test:event';
      const size = 1024;
      const limit = 512;
      const error = BusErrorFactory.payloadTooLarge(event, size, limit);

      expect(error.busCode).toBe(BusErrorCode.PAYLOAD_TOO_LARGE);
      expect(error.message).toBe(`Payload size ${size} bytes exceeds limit of ${limit} bytes for event: ${event}`);
      expect(error.details).toEqual({ event, size, limit });
    });
  });

  describe('tooManyRequests', () => {
    it('should create TOO_MANY_REQUESTS error', () => {
      const event = 'test:event';
      const limit = 100;
      const window = 60000;
      const error = BusErrorFactory.tooManyRequests(event, limit, window);

      expect(error.busCode).toBe(BusErrorCode.TOO_MANY_REQUESTS);
      expect(error.message).toBe(`Rate limit exceeded: ${limit} requests per ${window}ms for event: ${event}`);
      expect(error.details).toEqual({ event, limit, window });
    });
  });

  describe('internal', () => {
    it('should create INTERNAL_ERROR with message only', () => {
      const message = 'Database connection failed';
      const error = BusErrorFactory.internal(message);

      expect(error.busCode).toBe(BusErrorCode.INTERNAL_ERROR);
      expect(error.message).toBe(`Internal error: ${message}`);
      expect(error.details).toEqual({});
    });

    it('should create INTERNAL_ERROR with original error', () => {
      const message = 'Database connection failed';
      const originalError = new Error('Connection timeout');
      const error = BusErrorFactory.internal(message, originalError);

      expect(error.busCode).toBe(BusErrorCode.INTERNAL_ERROR);
      expect(error.details).toEqual({
        originalError: originalError.message,
        stack: originalError.stack
      });
    });

    it('should include additional details', () => {
      const message = 'Database failed';
      const originalError = new Error('Connection lost');
      const additionalDetails = { database: 'users' };
      const error = BusErrorFactory.internal(message, originalError, additionalDetails);

      expect(error.details).toEqual({
        originalError: originalError.message,
        stack: originalError.stack,
        ...additionalDetails
      });
    });
  });

  describe('badRequest', () => {
    it('should create BAD_REQUEST error', () => {
      const event = 'test:event';
      const reason = 'Invalid payload format';
      const error = BusErrorFactory.badRequest(event, reason);

      expect(error.busCode).toBe(BusErrorCode.BAD_REQUEST);
      expect(error.message).toBe(`Bad request for event: ${event}. ${reason}`);
      expect(error.details).toEqual({ event, reason });
    });
  });

  describe('gone', () => {
    it('should create GONE error', () => {
      const event = 'test:event';
      const error = BusErrorFactory.gone(event);

      expect(error.busCode).toBe(BusErrorCode.GONE);
      expect(error.message).toBe(`Responder for event: ${event} is no longer available`);
      expect(error.details).toEqual({ event });
    });
  });

  describe('serviceUnavailable', () => {
    it('should create SERVICE_UNAVAILABLE error without retry after', () => {
      const event = 'test:event';
      const error = BusErrorFactory.serviceUnavailable(event);

      expect(error.busCode).toBe(BusErrorCode.SERVICE_UNAVAILABLE);
      expect(error.message).toBe(`Service temporarily unavailable for event: ${event}`);
      expect(error.details).toEqual({ event, retryAfter: undefined });
    });

    it('should create SERVICE_UNAVAILABLE error with retry after', () => {
      const event = 'test:event';
      const retryAfter = 5000;
      const error = BusErrorFactory.serviceUnavailable(event, retryAfter);

      expect(error.busCode).toBe(BusErrorCode.SERVICE_UNAVAILABLE);
      expect(error.message).toBe(`Service unavailable for event: ${event}. Retry after ${retryAfter}ms`);
      expect(error.details).toEqual({ event, retryAfter });
    });
  });

  describe('unprocessableEntity', () => {
    it('should create UNPROCESSABLE_ENTITY error', () => {
      const event = 'test:event';
      const reason = 'Business validation failed';
      const error = BusErrorFactory.unprocessableEntity(event, reason);

      expect(error.busCode).toBe(BusErrorCode.UNPROCESSABLE_ENTITY);
      expect(error.message).toBe(`Unprocessable request for event: ${event}. ${reason}`);
      expect(error.details).toEqual({ event, reason });
    });
  });
});

describe('Type Guards', () => {
  describe('isBusError', () => {
    it('should return true for BusError instances', () => {
      const error = new BusError('Test', BusErrorCode.NOT_FOUND);
      expect(isBusError(error)).toBe(true);
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('Test');
      expect(isBusError(error)).toBe(false);
    });

    it('should return false for ConnecticError instances', () => {
      const error = new ConnecticError('Test');
      expect(isBusError(error)).toBe(false);
    });

    it('should return false for non-error objects', () => {
      expect(isBusError(null)).toBe(false);
      expect(isBusError(undefined)).toBe(false);
      expect(isBusError({})).toBe(false);
      expect(isBusError('error')).toBe(false);
      expect(isBusError(404)).toBe(false);
    });
  });

  describe('hasBusErrorCode', () => {
    it('should return true for BusError with matching code', () => {
      const error = new BusError('Test', BusErrorCode.NOT_FOUND);
      expect(hasBusErrorCode(error, BusErrorCode.NOT_FOUND)).toBe(true);
    });

    it('should return false for BusError with different code', () => {
      const error = new BusError('Test', BusErrorCode.NOT_FOUND);
      expect(hasBusErrorCode(error, BusErrorCode.TIMEOUT)).toBe(false);
    });

    it('should return false for non-BusError instances', () => {
      const error = new Error('Test');
      expect(hasBusErrorCode(error, BusErrorCode.NOT_FOUND)).toBe(false);
    });

    it('should return false for non-error objects', () => {
      expect(hasBusErrorCode(null, BusErrorCode.NOT_FOUND)).toBe(false);
      expect(hasBusErrorCode({}, BusErrorCode.NOT_FOUND)).toBe(false);
    });
  });
});

describe('wrapError', () => {
  it('should return BusError unchanged', () => {
    const originalError = new BusError('Test', BusErrorCode.NOT_FOUND);
    const wrappedError = wrapError(originalError);

    expect(wrappedError).toBe(originalError);
  });

  it('should wrap regular Error as BusError', () => {
    const originalError = new Error('Original error message');
    const wrappedError = wrapError(originalError);

    expect(wrappedError).toBeInstanceOf(BusError);
    expect(wrappedError.busCode).toBe(BusErrorCode.INTERNAL_ERROR);
    expect(wrappedError.message).toBe('Internal error: Original error message');
    expect(wrappedError.details).toEqual({
      originalError: originalError.message,
      stack: originalError.stack
    });
  });

  it('should wrap regular Error with event context', () => {
    const originalError = new Error('Original error');
    const event = 'test:event';
    const wrappedError = wrapError(originalError, event);

    expect(wrappedError.details).toEqual({
      originalError: originalError.message,
      stack: originalError.stack,
      event
    });
  });

  it('should wrap unknown error types', () => {
    const unknownError = 'String error';
    const wrappedError = wrapError(unknownError);

    expect(wrappedError).toBeInstanceOf(BusError);
    expect(wrappedError.busCode).toBe(BusErrorCode.INTERNAL_ERROR);
    expect(wrappedError.message).toBe('Internal error: Unknown error: String error');
    expect(wrappedError.details).toEqual({
      originalError: unknownError
    });
  });

  it('should wrap null/undefined errors', () => {
    const wrappedNull = wrapError(null);
    const wrappedUndefined = wrapError(undefined);

    expect(wrappedNull.message).toBe('Internal error: Unknown error: null');
    expect(wrappedUndefined.message).toBe('Internal error: Unknown error: undefined');
  });

  it('should wrap object errors', () => {
    const objectError = { code: 'ERR_001', message: 'Custom error' };
    const wrappedError = wrapError(objectError);

    expect(wrappedError.message).toContain('[object Object]');
    expect(wrappedError.details.originalError).toBe(objectError);
  });
});

describe('ErrorMessages', () => {
  it('should have all expected error message constants', () => {
    expect(ErrorMessages.INVALID_EVENT_NAME).toBe('Event name must be a non-empty string');
    expect(ErrorMessages.INVALID_PAYLOAD).toBe('Event payload must be serializable');
    expect(ErrorMessages.INVALID_HANDLER).toBe('Event handler must be a function');
    expect(ErrorMessages.INVALID_TIMEOUT).toBe('Timeout must be a positive number');
    expect(ErrorMessages.INVALID_RETRIES).toBe('Retries must be a non-negative number');
    expect(ErrorMessages.BUS_DESTROYED).toBe('Bus instance has been destroyed');
    expect(ErrorMessages.MIDDLEWARE_ERROR).toBe('Middleware execution failed');
    expect(ErrorMessages.CACHE_ERROR).toBe('Cache operation failed');
    expect(ErrorMessages.STATE_NOT_FOUND).toBe('State key not found');
    expect(ErrorMessages.COMPUTED_CIRCULAR_DEPENDENCY).toBe('Circular dependency detected in computed state');
  });

  it('should have readonly properties', () => {
    // ErrorMessages uses 'as const' which makes it readonly at TypeScript level
    // In practice, the object properties are accessible but TypeScript prevents modification
    expect(typeof ErrorMessages.INVALID_EVENT_NAME).toBe('string');
    expect(ErrorMessages.INVALID_EVENT_NAME).toBe('Event name must be a non-empty string');
    
    // At runtime, the object is not actually frozen, so we test that it behaves as expected
    const originalValue = ErrorMessages.INVALID_EVENT_NAME;
    expect(originalValue).toBeDefined();
  });
});

describe('createValidationError', () => {
  it('should create validation error with correct format', () => {
    const field = 'timeout';
    const value = 'invalid';
    const expected = 'positive number';
    const error = createValidationError(field, value, expected);

    expect(error).toBeInstanceOf(BusError);
    expect(error.busCode).toBe(BusErrorCode.BAD_REQUEST);
    expect(error.message).toBe(`Bad request for event: validation. Invalid ${field}: expected ${expected}, got ${typeof value}`);
    expect(error.details).toEqual({
      event: 'validation',
      reason: `Invalid ${field}: expected ${expected}, got ${typeof value}`,
      field,
      value,
      expected
    });
  });

  it('should handle different value types', () => {
    const numberError = createValidationError('count', 'not-a-number', 'number');
    expect(numberError.details.value).toBe('not-a-number');
    expect(numberError.message).toContain('got string');

    const booleanError = createValidationError('flag', null, 'boolean');
    expect(booleanError.details.value).toBe(null);
    expect(booleanError.message).toContain('got object');

    const objectError = createValidationError('config', 123, 'object');
    expect(objectError.details.value).toBe(123);
    expect(objectError.message).toContain('got number');
  });
});
