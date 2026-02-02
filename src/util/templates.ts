import nunjucks from 'nunjucks';
import cliState from '../cliState';
import { getEnvBool } from '../envars';

import type { NunjucksFilterMap } from '../types/index';

// Cache for Nunjucks engines without custom filters
// Key format: `${throwOnUndefined}-${isGrader}`
const engineCache = new Map<string, nunjucks.Environment>();

// Track the config reference to invalidate cache when config changes
let cachedConfigRef: object | undefined;

/**
 * Creates a fresh Nunjucks environment with the given configuration.
 */
function createNunjucksEngine(
  throwOnUndefined: boolean,
  filters?: NunjucksFilterMap,
): nunjucks.Environment {
  const env = nunjucks.configure({
    autoescape: false,
    throwOnUndefined,
  });

  // Configure environment variables as template globals
  // PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS now specifically controls process.env access (defaults to true in self-hosted mode)
  // Config env variables from the config file are always available
  const processEnvVarsDisabled = getEnvBool(
    'PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS',
    getEnvBool('PROMPTFOO_SELF_HOSTED', false),
  );

  const envGlobals = {
    ...(processEnvVarsDisabled ? {} : process.env),
    ...cliState.config?.env,
  };
  env.addGlobal('env', envGlobals);

  env.addFilter('load', function (str) {
    return JSON.parse(str);
  });

  if (filters) {
    for (const [name, filter] of Object.entries(filters)) {
      env.addFilter(name, filter);
    }
  }
  return env;
}

/**
 * Get a Nunjucks engine instance with optional filters and configuration.
 * Engines without custom filters are cached for performance.
 * @param filters - Optional map of custom Nunjucks filters.
 * @param throwOnUndefined - Whether to throw an error on undefined variables.
 * @param isGrader - Whether this engine is being used in a grader context.
 * Nunjucks is always enabled in grader mode.
 * @returns A configured Nunjucks environment.
 */
export function getNunjucksEngine(
  filters?: NunjucksFilterMap,
  throwOnUndefined: boolean = false,
  isGrader: boolean = false,
): nunjucks.Environment {
  if (!isGrader && getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return {
      renderString: (template: string) => template,
    } as unknown as nunjucks.Environment;
  }

  // Skip caching when custom filters are provided (they may differ between calls)
  if (filters && Object.keys(filters).length > 0) {
    return createNunjucksEngine(throwOnUndefined, filters);
  }

  // Invalidate cache if config reference has changed
  const currentConfigRef = cliState.config;
  if (currentConfigRef !== cachedConfigRef) {
    engineCache.clear();
    cachedConfigRef = currentConfigRef;
  }

  const cacheKey = `${throwOnUndefined}-${isGrader}`;
  let engine = engineCache.get(cacheKey);

  if (!engine) {
    engine = createNunjucksEngine(throwOnUndefined);
    engineCache.set(cacheKey, engine);
  }

  return engine;
}

/**
 * Clear the Nunjucks engine cache. Useful for testing or when config changes.
 */
export function clearNunjucksEngineCache(): void {
  engineCache.clear();
  cachedConfigRef = undefined;
}

/**
 * Parse Nunjucks template to extract variables.
 * @param template - The Nunjucks template string.
 * @returns An array of variables used in the template.
 */
export function extractVariablesFromTemplate(template: string): string[] {
  const variableSet = new Set<string>();
  const regex =
    /\{\{[\s]*([^{}\s|]+)[\s]*(?:\|[^}]+)?\}\}|\{%[\s]*(?:if|for)[\s]+([^{}\s]+)[\s]*.*?%\}/g;
  const commentRegex = /\{#[\s\S]*?#\}/g;

  // Remove comments
  template = template.replace(commentRegex, '');

  let match;
  while ((match = regex.exec(template)) !== null) {
    const variable = match[1] || match[2];
    if (variable) {
      // Split by dot and add only the full path
      variableSet.add(variable);
    }
  }

  // Handle for loops separately
  const forLoopRegex = /\{%[\s]*for[\s]+(\w+)[\s]+in[\s]+(\w+)[\s]*%\}/g;
  while ((match = forLoopRegex.exec(template)) !== null) {
    variableSet.delete(match[1]); // Remove loop variable
    variableSet.add(match[2]); // Add the iterated variable
  }

  return Array.from(variableSet);
}

/**
 * Extract variables from multiple Nunjucks templates.
 * @param templates - An array of Nunjucks template strings.
 * @returns An array of variables used in the templates.
 */
export function extractVariablesFromTemplates(templates: string[]): string[] {
  const variableSet = new Set<string>();
  for (const template of templates) {
    const variables = extractVariablesFromTemplate(template);
    variables.forEach((variable) => variableSet.add(variable));
  }
  return Array.from(variableSet);
}
