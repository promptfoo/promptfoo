import nunjucks from 'nunjucks';
import cliState from '../cliState';
import { getEnvBool } from '../envars';

import type { NunjucksFilterMap } from '../types/index';

type NunjucksAstNode = {
  fields?: readonly string[];
  typename?: string;
  value?: unknown;
  [field: string]: unknown;
};

type NunjucksParser = {
  parse: (template: string) => NunjucksAstNode;
};

type NunjucksWithParser = typeof nunjucks & {
  parser: NunjucksParser;
};

type NunjucksParentContext = {
  field: string;
  node: NunjucksAstNode;
};

function isNunjucksAstNode(value: unknown): value is NunjucksAstNode {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { typename?: unknown }).typename === 'string',
  );
}

function parseNunjucksTemplate(template: string): NunjucksAstNode | undefined {
  try {
    return (nunjucks as unknown as NunjucksWithParser).parser.parse(template);
  } catch {
    return undefined;
  }
}

function isNonReferenceSymbol(parent?: NunjucksParentContext): boolean {
  if (!parent) {
    return false;
  }

  return (
    (parent.node.typename === 'Pair' && parent.field === 'key') ||
    (parent.node.typename === 'Filter' && parent.field === 'name') ||
    (parent.node.typename === 'Is' && parent.field === 'right') ||
    (parent.node.typename === 'Set' && parent.field === 'targets') ||
    (parent.node.typename === 'For' && parent.field === 'name') ||
    (parent.node.typename === 'Macro' && parent.field === 'name')
  );
}

function collectSymbolValues(node: unknown): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectSymbolValues(item));
  }
  if (!isNunjucksAstNode(node)) {
    return [];
  }
  if (node.typename === 'Symbol' && typeof node.value === 'string') {
    return [node.value];
  }

  const values: string[] = [];
  for (const field of node.fields ?? []) {
    const child = node[field];
    if (Array.isArray(child)) {
      for (const item of child) {
        values.push(...collectSymbolValues(item));
      }
    } else {
      values.push(...collectSymbolValues(child));
    }
  }
  return values;
}

function addBoundSymbols(scope: ReadonlySet<string>, node: unknown): Set<string> {
  const nextScope = new Set(scope);
  for (const value of collectSymbolValues(node)) {
    nextScope.add(value);
  }
  return nextScope;
}

function astNodeListReferencesVariable(
  nodes: readonly unknown[],
  variableName: string,
  parent: NunjucksParentContext,
  boundSymbols: ReadonlySet<string>,
): boolean {
  let scope = new Set(boundSymbols);
  for (const item of nodes) {
    if (!isNunjucksAstNode(item)) {
      continue;
    }
    if (astReferencesVariable(item, variableName, parent, scope)) {
      return true;
    }
    if (item.typename === 'Set') {
      scope = addBoundSymbols(scope, item.targets);
    } else if (item.typename === 'Macro') {
      scope = addBoundSymbols(scope, item.name);
    }
  }
  return false;
}

function astChildReferencesVariable(
  node: NunjucksAstNode,
  field: string,
  variableName: string,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const child = node[field];
  if (Array.isArray(child)) {
    return child.some(
      (item) =>
        isNunjucksAstNode(item) &&
        astReferencesVariable(item, variableName, { field, node }, boundSymbols),
    );
  }
  return (
    isNunjucksAstNode(child) &&
    astReferencesVariable(child, variableName, { field, node }, boundSymbols)
  );
}

function forNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: string,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const loopScope = addBoundSymbols(boundSymbols, node.name);
  return (
    astChildReferencesVariable(node, 'arr', variableName, boundSymbols) ||
    astChildReferencesVariable(node, 'body', variableName, loopScope) ||
    astChildReferencesVariable(node, 'else_', variableName, boundSymbols)
  );
}

function macroNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: string,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const macroScope = addBoundSymbols(addBoundSymbols(boundSymbols, node.name), node.args);
  return astChildReferencesVariable(node, 'body', variableName, macroScope);
}

function setNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: string,
  boundSymbols: ReadonlySet<string>,
): boolean {
  return (
    astChildReferencesVariable(node, 'value', variableName, boundSymbols) ||
    astChildReferencesVariable(node, 'body', variableName, boundSymbols)
  );
}

function astFieldsReferenceVariable(
  node: NunjucksAstNode,
  variableName: string,
  boundSymbols: ReadonlySet<string>,
): boolean {
  return (node.fields ?? []).some((field) =>
    astChildReferencesVariable(node, field, variableName, boundSymbols),
  );
}

function astReferencesVariable(
  node: NunjucksAstNode,
  variableName: string,
  parent?: NunjucksParentContext,
  boundSymbols: ReadonlySet<string> = new Set(),
): boolean {
  if (node.typename === 'Symbol' && node.value === variableName) {
    return !boundSymbols.has(variableName) && !isNonReferenceSymbol(parent);
  }

  if ((node.typename === 'Root' || node.typename === 'NodeList') && Array.isArray(node.children)) {
    return astNodeListReferencesVariable(
      node.children,
      variableName,
      { field: 'children', node },
      boundSymbols,
    );
  }

  if (node.typename === 'For') {
    return forNodeReferencesVariable(node, variableName, boundSymbols);
  }

  if (node.typename === 'Macro') {
    return macroNodeReferencesVariable(node, variableName, boundSymbols);
  }

  if (node.typename === 'Set') {
    return setNodeReferencesVariable(node, variableName, boundSymbols);
  }

  return astFieldsReferenceVariable(node, variableName, boundSymbols);
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
 * Check whether a valid Nunjucks template references a variable as an expression symbol.
 */
export function templateReferencesVariable(template: string, variableName: string): boolean {
  if (!variableName || !template.includes(variableName)) {
    return false;
  }

  const ast = parseNunjucksTemplate(template);
  return ast ? astReferencesVariable(ast, variableName) : false;
}
