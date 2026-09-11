import type { ResponseHeadersObserver } from './types';

type HeaderArguments = Parameters<ResponseHeadersObserver>;
type Observe = (args: HeaderArguments, alreadyObserved: boolean) => boolean;

// Provenance lives on the callback, not in a registry of providers or call contexts.
const OWNER = Symbol('rateLimitResponseHeadersObserver');
const CALLER_ERRORS = Symbol('responseHeadersCallerErrors');
const CALLER_ERROR_RESPONSE = Symbol('responseHeadersCallerErrorResponse');
interface ObserverOwner {
  owner: object;
  observe: Observe;
  caller?: ResponseHeadersObserver;
  errors: Set<unknown>;
}
type OwnedObserver = ResponseHeadersObserver & {
  [OWNER]?: ObserverOwner;
  [CALLER_ERRORS]?: Set<unknown>;
};

function ownedObserver(record: ObserverOwner): ResponseHeadersObserver {
  const observer: OwnedObserver = (...args) => {
    let observed = record.observe(args, false);
    let caller = record.caller;
    const owners = [record];
    while (caller) {
      const inherited = (caller as OwnedObserver)[OWNER];
      if (!inherited) {
        try {
          caller(...args);
        } catch (error) {
          // Keep provenance local to these calls without mutating the thrown value.
          for (const owner of owners) {
            owner.errors.add(error);
          }
          throw error;
        }
        break;
      }
      // A nested provider must not publish its quota to an unrelated ancestor.
      // Matching owners still record delivery so later result handling will not
      // parse the same relative reset again, but only one live call updates quota.
      if (inherited.owner === record.owner) {
        observed = inherited.observe(args, observed);
      }
      owners.push(inherited);
      caller = inherited.caller;
    }
  };
  observer[OWNER] = record;
  observer[CALLER_ERRORS] = record.errors;
  return observer;
}

export function createResponseHeadersObserver(
  owner: object,
  observe: Observe,
): ResponseHeadersObserver {
  return ownedObserver({ owner, observe, errors: new Set() });
}

export function composeResponseHeadersObservers(
  observer: ResponseHeadersObserver,
  caller: ResponseHeadersObserver | undefined,
): ResponseHeadersObserver {
  if (!caller) {
    return observer;
  }
  const record = (observer as OwnedObserver)[OWNER];
  if (record) {
    return ownedObserver({ ...record, caller });
  }
  // Preserve the callback contract for structurally supplied registries too.
  const errors = new Set<unknown>();
  const combined: OwnedObserver = (...args) => {
    observer(...args);
    try {
      caller(...args);
    } catch (error) {
      errors.add(error);
      throw error;
    }
  };
  combined[CALLER_ERRORS] = errors;
  return combined;
}

export function isResponseHeadersObserverError(
  observer: ResponseHeadersObserver | undefined,
  error: unknown,
): boolean {
  return (observer as OwnedObserver | undefined)?.[CALLER_ERRORS]?.has(error) ?? false;
}

/** Retain the provider's existing diagnostic when it converts a caller exception. */
export function preserveResponseHeadersObserverError<T extends object>(
  observer: ResponseHeadersObserver | undefined,
  error: unknown,
  response: T,
): T {
  if (isResponseHeadersObserverError(observer, error)) {
    Object.defineProperty(response, CALLER_ERROR_RESPONSE, { value: true });
  }
  return response;
}

export function isResponseHeadersObserverErrorResponse(response: unknown): boolean {
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { [CALLER_ERROR_RESPONSE]?: boolean })[CALLER_ERROR_RESPONSE] === true
  );
}

/** Copy private caller-exception provenance when the same error response is projected. */
export function preserveResponseHeadersObserverErrorResponse<T extends object>(
  source: unknown,
  response: T,
): T {
  if (isResponseHeadersObserverErrorResponse(source)) {
    Object.defineProperty(response, CALLER_ERROR_RESPONSE, { value: true });
  }
  return response;
}
