import { z } from 'zod';

import type { AssertionValueFunctionContext, EnvOverrides } from '../types/index';

export const MAX_PENDING_PROVIDER_CALLS = 8;

export interface JavascriptWorkerRequest {
  value: string;
  functionBody: string;
  output: unknown;
  context: Omit<AssertionValueFunctionContext, 'provider'> & {
    provider?: { id: string; label?: string; config?: unknown };
  };
  basePath: string;
  env?: EnvOverrides;
  envFileOverrides?: EnvOverrides;
}

export const JavascriptWorkerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('result'), result: z.unknown() }).strict(),
  z.object({ type: z.literal('error'), message: z.string() }).strict(),
  z
    .object({
      type: z.literal('callApi'),
      callId: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
      args: z.tuple([
        z.string(),
        z.record(z.string(), z.unknown()).optional(),
        z.object({ includeLogProbs: z.boolean().optional() }).strict().optional(),
      ]),
    })
    .strict(),
]);

export const JavascriptProviderResultSchema = z.discriminatedUnion('ok', [
  z.object({ callId: z.number().int(), ok: z.literal(true), result: z.unknown() }).strict(),
  z.object({ callId: z.number().int(), ok: z.literal(false), message: z.string() }).strict(),
]);

/** Worker mode accepts data, without executing getters or dropping functions/prototypes. */
export function cloneJavascriptWorkerData<T>(value: T): T {
  const seen = new WeakSet<object>();
  function check(current: unknown): void {
    if (typeof current === 'function' || typeof current === 'symbol') {
      throw new Error(
        'Worker JavaScript assertions require plain data; functions and symbols are unsupported.',
      );
    }
    if (current === null || typeof current !== 'object' || seen.has(current)) {
      return;
    }
    seen.add(current);
    const prototype = Object.getPrototypeOf(current);
    if (
      Array.isArray(current)
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    ) {
      throw new Error(
        'Worker JavaScript assertions require plain objects and arrays; class instances are unsupported.',
      );
    }
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
      if (typeof key === 'symbol' || !('value' in descriptor)) {
        throw new Error(
          'Worker JavaScript assertions do not support symbol properties or accessors.',
        );
      }
      if (descriptor.enumerable) {
        check(descriptor.value);
      } else if (!(Array.isArray(current) && key === 'length')) {
        throw new Error('Worker JavaScript assertions do not support non-enumerable properties.');
      }
    }
  }
  check(value);
  return structuredClone(value);
}
