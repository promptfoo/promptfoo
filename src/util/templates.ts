import nunjucks from 'nunjucks';
import cliState from '../cliState';
import { getEnvBool } from '../envars';
import type { NunjucksFilterMap } from '../types';

/**
 * Custom Nunjucks extension that allows for verbatim placeholders using the verbatim tag.
 */
class VerbatimExtension {
  tags = ['verbatim'];
  
  parse(parser: any, nodes: any) {
    // Get the token that opened the tag.
    const token = parser.nextToken();
    
    // Parse the arguments inside the tag
    const args = parser.parseSignature(null, true);
    parser.advanceAfterBlockEnd(token.value);
    
    // Parse the content until the close tag
    const body = parser.parseUntilBlocks('endverbatim');
    parser.advanceAfterBlockEnd();
    
    // Return a node that just returns the body content directly without processing
    return new nodes.CallExtension(this, 'run', args, [body]);
  }
  
  run(_context: any, _args: any, body: () => string) {
    // Return the content without processing
    return body();
  }
}

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

  // Add custom extensions
  env.addExtension('VerbatimExtension', new VerbatimExtension());

  // Configure environment variables as template globals unless disabled. Defaults to disabled in self-hosted mode
  if (
    !getEnvBool('PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', getEnvBool('PROMPTFOO_SELF_HOSTED', false))
  ) {
    env.addGlobal('env', {
      ...process.env,
      ...cliState.config?.env,
    });
  }

  env.addFilter('load', function (str) {
    return JSON.parse(str);
  });
  
  // Add a filter to escape curly braces for literal output
  env.addFilter('literal', function (str) {
    return `{{${str}}}`;
  });

  // Add a filter to escape Nunjucks syntax
  env.addFilter('escape_template', function (str) {
    if (typeof str !== 'string') {
      return str;
    }
    return str.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
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

export function getTemplateContext(additionalContext: Record<string, any> = {}) {
  if (getEnvBool('PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', false)) {
    return additionalContext;
  }

  return {
    ...additionalContext,
    // Add environment variables with config.env taking precedence
    env: {
      ...process.env,
      ...(cliState.config?.env || {}),
      ...additionalContext.env,
    },
  };
}
