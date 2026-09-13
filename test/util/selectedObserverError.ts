import { expect, vi } from 'vitest';
import {
  composeResponseHeadersObservers,
  createResponseHeadersObserver,
  isResponseHeadersObserverErrorResponse,
  preserveResponseHeadersObserverError,
} from '../../src/scheduler/responseHeadersObserver';

import type { ProviderResponse } from '../../src/types/providers';

/** A provider input fixture with provenance from an actual throwing caller. */
export function createSelectedObserverErrorResponse(
  response: ProviderResponse,
  diagnostic = response.error ?? 'metrics rate limit exceeded',
): ProviderResponse {
  const reason = Object.freeze(new Error(diagnostic));
  const descriptors = Object.getOwnPropertyDescriptors(reason);
  const caller = vi.fn(() => {
    throw reason;
  });
  const observe = vi.fn(() => true);
  const observer = composeResponseHeadersObservers(
    createResponseHeadersObserver({}, observe),
    caller,
  );
  let caught: unknown;
  try {
    observer({ 'content-type': 'application/json' });
  } catch (error) {
    caught = error;
  }
  expect(caller).toHaveBeenCalledOnce();
  expect(observe).toHaveBeenCalledOnce();
  expect(caught).toBe(reason);
  expect(Object.getOwnPropertyDescriptors(reason)).toEqual(descriptors);
  const marked = preserveResponseHeadersObserverError(observer, caught, {
    ...response,
    error: diagnostic,
  });
  expect(isResponseHeadersObserverErrorResponse(marked)).toBe(true);
  return marked;
}
