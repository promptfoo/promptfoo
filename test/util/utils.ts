import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { ApiProvider, ProviderResponse } from '../../src/types/index';

/**
 * Creates a deferred promise that can be resolved or rejected externally.
 * Useful for controlling async flow in tests.
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

export class TestGrader implements ApiProvider {
  async callApi(): Promise<ProviderResponse> {
    return {
      output: JSON.stringify({ pass: true, reason: 'Test grading output' }),
      tokenUsage: { total: 10, prompt: 5, completion: 5 },
    };
  }

  id(): string {
    return 'TestGradingProvider';
  }
}

export function createMockResponse(
  options: {
    ok?: boolean;
    body?: any;
    statusText?: string;
    status?: number;
    headers?: Headers;
    text?: () => Promise<string>;
    json?: () => Promise<any>;
  } = { ok: true },
): Response {
  const isOk = options.ok ?? (options.status ? options.status < 400 : true);
  const mockResponse: Response = {
    ok: isOk,
    status: options.status || (isOk ? 200 : 400),
    statusText: options.statusText || (isOk ? 'OK' : 'Bad Request'),
    headers: options.headers || new Headers(),
    redirected: false,
    type: 'basic',
    url: 'https://example.com',
    json: options.json || (() => Promise.resolve(options.body || {})),
    text: options.text || (() => Promise.resolve('')),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
    bodyUsed: false,
    body: null,
    clone() {
      return createMockResponse(options);
    },
  } as Response;
  return mockResponse;
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

export type ConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn';

export function mockConsole(
  method: ConsoleMethod,
  implementation: (...args: unknown[]) => void = () => {},
): MockInstance {
  return vi.spyOn(console, method).mockImplementation(implementation);
}

function replaceProcessEnv(nextEnv: Record<string, string | undefined>): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, nextEnv);
}

export function mockProcessEnv(
  overrides: Record<string, string | undefined> = {},
  options: { clear?: boolean } = {},
): () => void {
  const originalEnv = { ...process.env };

  if (options.clear) {
    replaceProcessEnv({});
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    replaceProcessEnv(originalEnv);
  };
}

export function mockGlobal<T>(name: string, value: T): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);

  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
    writable: true,
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  };
}

export function createTempDir(prefix = 'promptfoo-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeTempDir(tempDir: string | undefined): void {
  if (!tempDir) {
    return;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}
