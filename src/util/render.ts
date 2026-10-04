import { getEnvBool } from '../envars';
import logger from '../logger';
import { getNunjucksEngine } from './templates';

import type { VarValue } from '../types';
import type { EnvOverrides } from '../types/env';

/**
 * Replaces every Nunjucks template `{{ ... }}` in `value`. A template runs from `{{` to the
 * next `}}`, so its content may contain `}` but not `}}`. The scan is linear in the length
 * of the string, including for strings with many unclosed `{{`.
 */
function replaceTemplates(value: string, replace: (template: string) => string): string {
  let result = '';
  let position = 0;
  while (true) {
    const start = value.indexOf('{{', position);
    const end = start === -1 ? -1 : value.indexOf('}}', start + 2);
    if (end === -1) {
      return position === 0 ? value : result + value.slice(position);
    }
    result += value.slice(position, start) + replace(value.slice(start, end + 2));
    position = end + 2;
  }
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
 * Implementation: Scans for templates, delegates the ones that reference env to Nunjucks.
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

  // Built on first use and shared by every string in `obj`. Most values contain no env
  // template, and merging the overrides enumerates the whole process environment.
  let templating:
    | {
        nunjucks: ReturnType<typeof getNunjucksEngine>;
        envGlobals: Record<string, string | undefined>;
      }
    | undefined;
  const getTemplating = () => {
    if (!templating) {
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
      templating = { nunjucks, envGlobals };
    }
    return templating;
  };

  const renderString = (value: string): string =>
    replaceTemplates(value, (match) => {
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
      const { nunjucks, envGlobals } = getTemplating();
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
    });

  const render = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return renderString(value);
    }

    if (Array.isArray(value)) {
      return value.map(render);
    }

    if (typeof value === 'object' && value !== null) {
      const result: Record<string, unknown> = {};
      for (const key in value) {
        // Conversation history is runtime data and may contain untrusted model output.
        // Preserve it as literal data instead of rendering env templates.
        result[key] =
          key === '_conversation'
            ? (value as Record<string, unknown>)[key]
            : render((value as Record<string, unknown>)[key]);
      }
      return result;
    }

    return value;
  };

  return render(obj) as T;
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
