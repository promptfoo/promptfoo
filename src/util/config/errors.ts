import logger from '../../logger';

type ConfigResolutionLogLevel = 'error' | 'warn';

export interface ConfigResolutionErrorOptions {
  cause?: unknown;
  cliMessage?: string;
  logLevel?: ConfigResolutionLogLevel;
}

export class ConfigResolutionError extends Error {
  readonly cliMessage: string;
  readonly logLevel: ConfigResolutionLogLevel;

  constructor(message: string, options: ConfigResolutionErrorOptions = {}) {
    super(message);
    this.name = 'ConfigResolutionError';
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        configurable: true,
      });
    }
    this.cliMessage = options.cliMessage ?? message;
    this.logLevel = options.logLevel === 'warn' ? 'warn' : 'error';
  }
}

export function logConfigResolutionError(error: ConfigResolutionError, prefix?: string): void {
  logger[error.logLevel](prefix ? `${prefix}${error.cliMessage}` : error.cliMessage);
}

export function failConfigResolution(
  message: string,
  options?: ConfigResolutionErrorOptions,
): never {
  throw new ConfigResolutionError(message, options);
}
