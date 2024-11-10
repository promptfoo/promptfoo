import nunjucks from 'nunjucks';
import { getEnvBool } from '../envars';
import type { NunjucksFilterMap } from '../types';

const engineCache = new Map<string, nunjucks.Environment>();

/**
 * Get a cached Nunjucks engine instance with optional filters and configuration.
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
  // Create a cache key based on the parameters
  const cacheKey = JSON.stringify({
    filters: filters ? Object.keys(filters).sort().join(',') : undefined,
    throwOnUndefined,
    isGrader,
  });

  // Check if we have a cached instance
  if (engineCache.has(cacheKey)) {
    return engineCache.get(cacheKey)!;
  }

  if (!isGrader && getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    const env = {
      renderString: (template: string) => template,
    } as unknown as nunjucks.Environment;

    engineCache.set(cacheKey, env);
    return env;
  }

  const env = nunjucks.configure({
    autoescape: false,
    throwOnUndefined,
  });

  if (
    !getEnvBool('PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', getEnvBool('PROMPTFOO_SELF_HOSTED', false))
  ) {
    env.addGlobal('env', process.env);
  }

  if (filters) {
    for (const [name, filter] of Object.entries(filters)) {
      env.addFilter(name, filter);
    }
  }

  engineCache.set(cacheKey, env);
  return env;
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

/**
 * Clear the Nunjucks cache.
 */
export function clearNunjucksCache(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('clearNunjucksCache should only be called in test environments');
  }
  engineCache.clear();
}
