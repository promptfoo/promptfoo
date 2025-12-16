/**
 * Base error class for all MCP tool errors
 */
export abstract class McpError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Error thrown when a tool receives invalid arguments
 */
export class ValidationError extends McpError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
}

/**
 * Error thrown when a requested resource is not found
 */
export class NotFoundError extends McpError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;

  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID "${id}" not found` : `${resource} not found`;
    super(message, { resource, id });
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends McpError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, configPath?: string) {
    super(message, { configPath });
  }
}

/**
 * Error thrown when a provider fails
 */
export class ProviderError extends McpError {
  readonly code = 'PROVIDER_ERROR';
  readonly statusCode = 500;

  constructor(providerId: string, message: string, details?: Record<string, unknown>) {
    super(`Provider "${providerId}" error: ${message}`, { providerId, ...details });
  }
}

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends McpError {
  readonly code = 'TIMEOUT_ERROR';
  readonly statusCode = 408;

  constructor(operation: string, timeoutMs: number) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`, { operation, timeoutMs });
  }
}

/**
 * Error thrown when an external service is unavailable
 */
export class ServiceUnavailableError extends McpError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly statusCode = 503;

  constructor(service: string, details?: Record<string, unknown>) {
    super(`Service "${service}" is unavailable`, { service, ...details });
  }
}

/**
 * Error thrown when authentication or authorization fails
 */
export class AuthenticationError extends McpError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;

  constructor(message: string = 'Authentication failed') {
    super(message);
  }
}

/**
 * Error thrown when sharing functionality is not available
 */
export class SharingError extends McpError {
  readonly code = 'SHARING_ERROR';
  readonly statusCode = 503;
}

/**
 * Error thrown when rate limits are exceeded
 */
export class RateLimitError extends McpError {
  readonly code = 'RATE_LIMIT_ERROR';
  readonly statusCode = 429;

  constructor(service: string, retryAfter?: number, details?: Record<string, unknown>) {
    const message = retryAfter
      ? `Rate limit exceeded for ${service}. Retry after ${retryAfter} seconds.`
      : `Rate limit exceeded for ${service}`;
    super(message, { service, retryAfter, ...details });
  }
}

/**
 * Error thrown when file operations fail
 */
export class FileOperationError extends McpError {
  readonly code = 'FILE_OPERATION_ERROR';
  readonly statusCode = 500;

  constructor(
    operation: 'read' | 'write' | 'delete' | 'create',
    filePath: string,
    originalError?: Error,
  ) {
    super(`Failed to ${operation} file: ${filePath}`, {
      operation,
      filePath,
      originalError: originalError?.message,
    });
  }
}

/**
 * Utility function to convert unknown errors to McpError
 */
export function toMcpError(
  error: unknown,
  defaultMessage: string = 'Unknown error occurred',
): McpError {
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for specific error patterns
    if (message.includes('rate limit')) {
      return new RateLimitError('service', undefined, { originalError: error.message });
    }

    if (message.includes('not found') || message.includes('enoent')) {
      return new NotFoundError('Resource', undefined);
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return new TimeoutError('Operation', 30000);
    }

    if (
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    ) {
      return new AuthenticationError(error.message);
    }

    if (message.includes('config') || message.includes('invalid')) {
      return new ConfigurationError(error.message);
    }

    return new ValidationError(error.message);
  }

  return new ValidationError(defaultMessage, { originalError: error });
}

/**
 * Type guard to check if an error is an McpError
 */
export function isMcpError(error: unknown): error is McpError {
  return error instanceof McpError;
}
