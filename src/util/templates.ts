import nunjucks from 'nunjucks';
import cliState from '../cliState';
import { getEnvBool } from '../envars';

import type { NunjucksFilterMap } from '../types/index';

/**
 * Get a Nunjucks engine instance with optional filters and configuration.
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
 * Parse Nunjucks template to extract variables.
 * @param template - The Nunjucks template string.
 * @returns An array of variables used in the template.
 */
export function extractVariablesFromTemplate(template: string): string[] {
  if (!template) {
    return [];
  }

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

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRootVariableReference(variable: string, variableName: string): boolean {
  return (
    variable === variableName ||
    variable.startsWith(`${variableName}.`) ||
    variable.startsWith(`${variableName}[`)
  );
}

function stripJavaScriptComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^\\:])\/\/.*$/gm, '$1 ');
}

function maskQuotedStrings(source: string): string {
  return source.replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, (match) => {
    if (match.length <= 2) {
      return match;
    }

    return `${match[0]}${' '.repeat(match.length - 2)}${match[match.length - 1]}`;
  });
}

function promptFunctionUsesVariable(source: string, variableName: string): boolean {
  const cleanedSource = stripJavaScriptComments(source);
  const maskedSource = maskQuotedStrings(cleanedSource);
  const escapedVariableName = escapeRegExp(variableName);

  return (
    new RegExp(`\\bvars\\s*(?:\\?\\.)?\\s*\\[\\s*['"]${escapedVariableName}['"]\\s*\\]`).test(
      cleanedSource,
    ) ||
    [
      new RegExp(`\\bvars\\s*(?:\\?\\.|\\.)\\s*${escapedVariableName}\\b`),
      new RegExp(`\\bvars\\s*:\\s*{[^}]*\\b${escapedVariableName}\\b`),
      new RegExp(
        `\\{[^}]*\\b${escapedVariableName}\\b[^}]*\\}\\s*=\\s*(?:[A-Za-z_$][\\w$]*\\s*\\.\\s*)?vars\\b`,
      ),
    ].some((pattern) => pattern.test(maskedSource))
  );
}

/**
 * Check whether a template uses a variable as the root of an expression.
 * @param template - The Nunjucks template string.
 * @param variableName - The variable name to search for.
 * @returns True when the variable is referenced directly or as the root object.
 */
export function templateUsesVariable(template: string, variableName: string): boolean {
  return extractVariablesFromTemplate(template).some((variable) =>
    isRootVariableReference(variable, variableName),
  );
}

/**
 * Check whether a prompt uses a variable either through Nunjucks syntax or a JavaScript prompt function.
 * @param prompt - Prompt source plus optional function marker.
 * @param variableName - The variable name to search for.
 * @returns True when the variable is referenced in either supported prompt style.
 */
export function promptUsesVariable(
  prompt: {
    raw: string;
    function?: unknown;
  },
  variableName: string,
): boolean {
  return (
    templateUsesVariable(prompt.raw ?? '', variableName) ||
    (Boolean(prompt.function) && promptFunctionUsesVariable(prompt.raw ?? '', variableName))
  );
}
