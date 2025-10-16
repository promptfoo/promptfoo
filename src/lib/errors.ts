import type { ErrorType, EvalErrorInfo } from '../types/result';

export class AppError extends Error {
  type: ErrorType;
  code?: string;
  hint?: string;
  provider?: string;
  requestId?: string;
  raw?: unknown;

  constructor(info: EvalErrorInfo) {
    super(info.message);
    this.name = 'AppError';
    this.type = info.type;
    this.code = info.code;
    this.hint = info.hint;
    this.provider = info.provider;
    this.requestId = info.requestId;
    this.raw = info.raw;
  }

  toInfo(): EvalErrorInfo {
    return {
      type: this.type,
      code: this.code,
      message: this.message,
      hint: this.hint,
      provider: this.provider,
      requestId: this.requestId,
      raw: this.raw,
    };
  }
}

// Helper constructors (sugar) for common categories
export const providerError   = (message: string, extras: Partial<EvalErrorInfo> = {}) =>
  new AppError({ type: 'provider_error',   message, ...extras });
export const validationError = (message: string, extras: Partial<EvalErrorInfo> = {}) =>
  new AppError({ type: 'validation_error', message, ...extras });
export const toolError       = (message: string, extras: Partial<EvalErrorInfo> = {}) =>
  new AppError({ type: 'tool_error',       message, ...extras });
export const timeoutError    = (message: string, extras: Partial<EvalErrorInfo> = {}) =>
  new AppError({ type: 'timeout',          message, ...extras });
