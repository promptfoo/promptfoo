import type { TestCase } from '../types';

const remoteFields = ['metadata', 'providerOutput', 'description'] as const;

type MapField = (key: string, value: unknown) => unknown;

/** Expand templates and file references only in locally authored fields. */
export function preserveRemoteFields(value: object, map: MapField): MapField {
  const origin = (value as TestCase).metadata?.__promptfoo;
  if (origin?.remote !== true) {
    return map;
  }
  return (key, child) => {
    if (remoteFields.some((field) => key === field)) {
      return child;
    }
    if (key !== 'vars') {
      return map(key, child);
    }
    if (!origin.remoteVars || !child || typeof child !== 'object' || Array.isArray(child)) {
      return child;
    }
    const remote = new Set(origin.remoteVars);
    return Object.fromEntries(
      Object.entries(child).map(([name, item]) => [name, remote.has(name) ? item : map(key, item)]),
    );
  };
}

/** The parser visits external documents with independent pointer namespaces. */
export function remoteTestRefOptions() {
  const literals = new WeakSet<object>();
  function protect(value: unknown) {
    if (value && typeof value === 'object') {
      literals.add(value);
    }
  }
  function exclude(_pointer: string, value?: unknown): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }
    if (literals.has(value)) {
      return true;
    }
    const test = value as TestCase;
    const origin = test.metadata?.__promptfoo;
    if (origin?.remote === true) {
      for (const key of remoteFields) {
        protect(test[key]);
      }
      // A $ref variable makes the containing map itself look like a reference.
      if (
        !origin.remoteVars ||
        (typeof test.vars?.$ref === 'string' && origin.remoteVars.includes('$ref'))
      ) {
        protect(test.vars);
      } else {
        for (const name of origin.remoteVars) {
          protect(test.vars?.[name]);
        }
      }
    }
    return false;
  }
  return { resolveExcludedPathMatcher: exclude, dereference: { excludedPathMatcher: exclude } };
}
