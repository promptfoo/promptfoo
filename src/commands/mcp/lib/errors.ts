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
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends McpError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, configPath?: string) {
    super(message, { configPath });
  }
}
