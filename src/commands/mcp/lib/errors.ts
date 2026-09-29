export class ConfigurationError extends Error {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 400;
  readonly details: { configPath?: string };

  constructor(message: string, configPath?: string) {
    super(message);
    this.name = this.constructor.name;
    this.details = { configPath };
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
