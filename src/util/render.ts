import { isDeepStrictEqual } from 'node:util';

import { getEnvBool } from '../envars';
import logger from '../logger';
import { type ApiProvider, isApiProvider } from '../types/providers';
import { getNunjucksEngine } from './templates';

import type { VarValue } from '../types';
import type { EnvOverrides } from '../types/env';

// Cached JavaScript configs reuse instances across evaluations with different environments.
const providerTemplates = new WeakMap<
  ApiProvider,
  { source: Pick<ApiProvider, 'config' | 'label'>; rendered: Pick<ApiProvider, 'config' | 'label'> }
>();

function snapshotProviderTemplate<T>(
  value: T,
  previous?: { rendered: unknown; source: unknown },
): T {
  if (previous && isDeepStrictEqual(value, previous.rendered)) {
    return previous.source as T;
  }
  if (!value || typeof value !== 'object' || isApiProvider(value)) {
    return value;
  }
  const childTemplate = (key: string, item: unknown) =>
    snapshotProviderTemplate(
      item,
      previous && {
        rendered: (previous.rendered as Record<string, unknown> | undefined)?.[key],
        source: (previous.source as Record<string, unknown> | undefined)?.[key],
      },
    );
  return (
    Array.isArray(value)
      ? value.map((item, index) => childTemplate(String(index), item))
      : Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, childTemplate(key, item)]),
        )
  ) as T;
}

/**
 * Renders ONLY environment variable templates in an object, leaving all other templates untouched.
 * This allows env vars to be resolved at provider load time while preserving runtime var templates.
 *
 * Supports full Nunjucks syntax for env vars including filters and expressions:
 * - {{ env.VAR_NAME }}
 * - {{ env['VAR-NAME'] }}
 * - {{ env["VAR-NAME"] }}
 * - {{ env.VAR | default('fallback') }}
 * - {{ env.VAR | upper }}
 *
 * Preserves non-env templates for runtime rendering:
 * - {{ vars.x }} - preserved as literal
 * - {{ prompt }} - preserved as literal
 *
 * Implementation: Uses regex to find env templates, delegates to Nunjucks for rendering.
 * This ensures full Nunjucks feature support while preserving non-env templates.
 *
 * @param obj - The object to process
 * @param envOverrides - Optional env vars to merge with (or replace) the base env
 * @param replaceBase - If true, envOverrides replaces the base env entirely instead of merging
 * @returns The object with only env templates rendered
 */
export function renderEnvOnlyInObject<T>(
  obj: T,
  envOverrides?: EnvOverrides,
  replaceBase?: boolean,
): T {
  if (getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return obj;
  }

  if (isApiProvider(obj)) {
    let templates = providerTemplates.get(obj);
    if (!templates) {
      templates = { source: {}, rendered: {} };
      providerTemplates.set(obj, templates);
    }
    for (const key of ['config', 'label'] as const) {
      templates.source[key] = snapshotProviderTemplate(obj[key], {
        rendered: templates.rendered[key],
        source: templates.source[key],
      });
      if (templates.source[key] !== undefined) {
        const rendered = renderEnvOnlyInObject(templates.source[key], envOverrides, replaceBase);
        if (!isDeepStrictEqual(rendered, obj[key]) && !Reflect.set(obj, key, rendered)) {
          if (key === 'config') {
            // Wrappers can expose a mutable backing config through a getter.
            Object.assign(obj.config, rendered);
          } else {
            Object.defineProperty(obj, key, {
              value: rendered,
              writable: true,
              configurable: true,
              enumerable: true,
            });
          }
        }
      }
      templates.rendered[key] = snapshotProviderTemplate(obj[key]);
    }
    return obj;
  }

  if (typeof obj === 'string') {
    const nunjucks = getNunjucksEngine();
    // process.env values are always strings or undefined, never numbers or booleans
    const baseEnvGlobals = nunjucks.getGlobal('env') as Record<string, string | undefined>;
    // If replaceBase is true, use envOverrides as the complete env (useful for isolating from cliState)
    // Otherwise merge envOverrides on top of baseEnvGlobals (normal override behavior)
    const envGlobals = replaceBase
      ? (envOverrides ?? {})
      : envOverrides
        ? { ...baseEnvGlobals, ...envOverrides }
        : baseEnvGlobals;

    // Match ALL Nunjucks templates {{ ... }}
    // The pattern (?:[^}]|\}(?!\}))* matches content that may contain } but not }}
    return obj.replace(/\{\{(?:[^}]|\}(?!\}))*\}\}/g, (match) => {
      // Only process templates that reference env
      if (!match.match(/\benv\.|env\[/)) {
        return match; // Not an env template, preserve as-is
      }

      // Extract the variable name to check if it exists
      const varMatch = match.match(/env\.(\w+)|env\[['"]([^'"]+)['"]\]/);
      const varName = varMatch?.[1] || varMatch?.[2];

      // Check if template contains a filter (indicated by |)
      // Filters often handle undefined values (e.g., default filter)
      const hasFilter = match.includes('|');

      // Render if:
      // 1. Template has a filter (let Nunjucks handle undefined with filter logic)
      // 2. Variable exists AND is not undefined (empty string is valid, undefined is not)
      // This prevents rendering {{env.FOO}} to empty string when FOO is undefined
      if (hasFilter || (varName && varName in envGlobals && envGlobals[varName] !== undefined)) {
        try {
          // Use Nunjucks to render the template (supports filters, expressions, etc.)
          return nunjucks.renderString(match, { env: envGlobals });
        } catch (error) {
          // On render error, log the issue and preserve the template
          logger.debug(
            `Failed to render env template "${match}": ${error instanceof Error ? error.message : String(error)}`,
          );
          return match;
        }
      }

      // Variable doesn't exist and no filter - preserve template for potential runtime resolution
      return match;
    }) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      renderEnvOnlyInObject(item, envOverrides, replaceBase),
    ) as unknown as T;
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      if (key === '_conversation') {
        // Conversation history is runtime data and may contain untrusted model output.
        // Preserve it as literal data instead of rendering env templates.
        result[key] = (obj as Record<string, unknown>)[key];
        continue;
      }
      result[key] = renderEnvOnlyInObject(
        (obj as Record<string, unknown>)[key],
        envOverrides,
        replaceBase,
      );
    }
    return result as T;
  }

  return obj;
}

export function renderVarsInObject<T>(obj: T, vars?: Record<string, VarValue>): T {
  // Renders nunjucks template strings with context variables
  if (!vars || getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return obj;
  }
  if (typeof obj === 'string') {
    const nunjucksEngine = getNunjucksEngine();
    return nunjucksEngine.renderString(obj, vars) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => renderVarsInObject(item, vars)) as unknown as T;
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      result[key] = renderVarsInObject((obj as Record<string, unknown>)[key], vars);
    }
    return result as T;
  } else if (typeof obj === 'function') {
    const fn = obj as Function;
    return renderVarsInObject(fn({ vars }) as T);
  }
  return obj;
}
