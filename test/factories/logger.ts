import { vi } from 'vitest';
import type { Mock } from 'vitest';

type LoggerModule = { default: Record<'debug' | 'info' | 'warn' | 'error', Mock> };

export function createLoggerModule(): LoggerModule {
  return {
    default: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

export function createLoggerModuleWithLevel(): LoggerModule & { getLogLevel: Mock } {
  return {
    ...createLoggerModule(),
    getLogLevel: vi.fn().mockReturnValue('info'),
  };
}

export function createErrorFirstLoggerModule(): LoggerModule {
  return {
    default: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
}

export function createWarningLoggerModule(): { default: Omit<LoggerModule['default'], 'info'> } {
  return {
    default: {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

export function createEsLoggerModule(errorFirst = false): LoggerModule & { __esModule: boolean } {
  return {
    __esModule: true,
    ...(errorFirst ? createErrorFirstLoggerModule() : createLoggerModule()),
  };
}
