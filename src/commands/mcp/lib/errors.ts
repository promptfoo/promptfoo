/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends Error {
  declare readonly code: 'CONFIGURATION_ERROR';
  declare readonly statusCode: 400;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, configPath?: string) {
    super(message);
    this.name = this.constructor.name;
    this.details = { configPath };
    Error.captureStackTrace(this, this.constructor);
    Object.defineProperties(this, {
      code: { value: 'CONFIGURATION_ERROR', enumerable: true, configurable: true, writable: true },
      statusCode: { value: 400, enumerable: true, configurable: true, writable: true },
    });
  }

  toJSON(): { code: string; message: string; details: Record<string, unknown> | undefined } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
