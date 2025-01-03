import nunjucks from 'nunjucks';
import { getEnvBool } from '../envars';
import type { NunjucksFilterMap } from '../types';

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

  if (
    !getEnvBool('PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', getEnvBool('PROMPTFOO_SELF_HOSTED', false))
  ) {
    env.addGlobal('env', process.env);
  }

  env.addFilter('dump', (obj) => {
    const hasTemplateVars = (value: unknown): boolean =>
      typeof value === 'string' && value.includes('{{') && value.includes('}}');

    const isSchemaVar = (value: unknown): boolean =>
      typeof value === 'string' && value.includes('{{') && value.includes('schema') && value.includes('}}');

    const formatValue = (value: unknown): string => {
      if (typeof value === 'string') {
        if (isSchemaVar(value)) {
          return value;
        }
        if (hasTemplateVars(value)) {
          return `'${value}'`;
        }
        if (value.includes('\n') || value.includes('"') || value.includes("'") || value.includes(':')) {
          return JSON.stringify(value);
        }
        return value;
      }

      if (value === null) {
        return 'null';
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }

      if (Array.isArray(value)) {
        const formattedItems = value.map(item => {
          const formatted = formatValue(item);
          if (typeof formatted === 'string' && isSchemaVar(formatted)) {
            return formatted;
          }
          if (typeof formatted === 'string' &&
              (formatted.startsWith('{') || formatted.startsWith('[') ||
               formatted.startsWith('"{'))) {
            try {
              return JSON.parse(formatted.replace(/^'|'$/g, ''));
            } catch {
              return formatted;
            }
          }
          return formatted;
        });
        return JSON.stringify(formattedItems);
      }

      if (typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
          const formatted = formatValue(v);
          if (typeof formatted === 'string' && isSchemaVar(formatted)) {
            result[k] = formatted;
          } else if (typeof formatted === 'string' &&
              (formatted.startsWith('{') || formatted.startsWith('[') ||
               formatted.startsWith('"{'))) {
            try {
              result[k] = JSON.parse(formatted.replace(/^'|'$/g, ''));
            } catch {
              result[k] = formatted;
            }
          } else {
            result[k] = formatted;
          }
        }
        return JSON.stringify(result);
      }

      return String(value);
    };

    if (typeof obj === 'string' && isSchemaVar(obj)) {
      return obj;
    }

    return formatValue(obj);
  });

  if (filters) {
    for (const [name, filter] of Object.entries(filters)) {
      env.addFilter(name, filter);
    }
  }
  return env;
}

export function extractVariablesFromTemplate(template: string): string[] {
  const variableSet = new Set<string>();
  const regex =
    /\{\{[\s]*([^{}\s|]+)[\s]*(?:\|[^}]+)?\}\}|\{%[\s]*(?:if|for)[\s]+([^{}\s]+)[\s]*.*?%\}/g;
  const commentRegex = /\{#[\s\S]*?#\}/g;

  template = template.replace(commentRegex, '');

  let match;
  while ((match = regex.exec(template)) !== null) {
    const variable = match[1] || match[2];
    if (variable) {
      variableSet.add(variable);
    }
  }

  const forLoopRegex = /\{%[\s]*for[\s]+(\w+)[\s]+in[\s]+(\w+)[\s]*%\}/g;
  while ((match = forLoopRegex.exec(template)) !== null) {
    if (match[1]) {
      variableSet.delete(match[1]);
    }
    if (match[2]) {
      variableSet.add(match[2]);
    }
  }

  return Array.from(variableSet);
}

export function extractVariablesFromTemplates(templates: string[]): string[] {
  const variableSet = new Set<string>();
  for (const template of templates) {
    const variables = extractVariablesFromTemplate(template);
    variables.forEach((variable) => variableSet.add(variable));
  }
  return Array.from(variableSet);
}
