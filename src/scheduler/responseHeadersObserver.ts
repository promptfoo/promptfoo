import type { ResponseHeadersObserver } from './types';

type HeaderArguments = Parameters<ResponseHeadersObserver>;
type Observe = (args: HeaderArguments, alreadyObserved: boolean) => boolean;

// Provenance lives on the callback, not in a registry of providers or call contexts.
const OWNER = Symbol('rateLimitResponseHeadersObserver');
interface ObserverOwner {
  owner: object;
  observe: Observe;
  caller?: ResponseHeadersObserver;
}
type OwnedObserver = ResponseHeadersObserver & { [OWNER]?: ObserverOwner };

function ownedObserver(record: ObserverOwner): ResponseHeadersObserver {
  const observer: OwnedObserver = (...args) => {
    let observed = record.observe(args, false);
    let caller = record.caller;
    while (caller) {
      const inherited = (caller as OwnedObserver)[OWNER];
      if (!inherited) {
        caller(...args);
        break;
      }
      // A nested provider must not publish its quota to an unrelated ancestor.
      // Matching owners still record delivery so later result handling will not
      // parse the same relative reset again, but only one live call updates quota.
      if (inherited.owner === record.owner) {
        observed = inherited.observe(args, observed);
      }
      caller = inherited.caller;
    }
  };
  observer[OWNER] = record;
  return observer;
}

export function createResponseHeadersObserver(
  owner: object,
  observe: Observe,
): ResponseHeadersObserver {
  return ownedObserver({ owner, observe });
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
  return (...args) => {
    observer(...args);
    caller(...args);
  };
}
