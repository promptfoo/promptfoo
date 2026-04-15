import nunjucks from 'nunjucks';
import cliState from '../cliState';
import { getEnvBool } from '../envars';
import logger from '../logger';

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
  parser?: NunjucksParser;
};

type NunjucksParentContext = {
  field: string;
  node: NunjucksAstNode;
};

type ParseResult = { ok: true; ast: NunjucksAstNode } | { ok: false };

function isNunjucksAstNode(value: unknown): value is NunjucksAstNode {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { typename?: unknown }).typename === 'string',
  );
}

function getNunjucksParser(): NunjucksParser | undefined {
  return (nunjucks as unknown as NunjucksWithParser).parser;
}

function parseNunjucksTemplate(template: string): ParseResult {
  const parser = getNunjucksParser();
  if (!parser || typeof parser.parse !== 'function') {
    // Nunjucks private parser export is missing — likely a version drift.
    // Surface it once at debug level and signal parse failure so callers
    // can fall back conservatively.
    logger.debug(
      '[templates] nunjucks.parser.parse is not available; falling back to conservative detection',
    );
    return { ok: false };
  }
  try {
    return { ok: true, ast: parser.parse(template) };
  } catch (err) {
    logger.debug(
      `[templates] nunjucks parse failed; falling back to conservative detection: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { ok: false };
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
    (parent.node.typename === 'Macro' && parent.field === 'name') ||
    (parent.node.typename === 'Import' && parent.field === 'target') ||
    (parent.node.typename === 'FromImport' && parent.field === 'names')
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
    } else if (item.typename === 'Import') {
      scope = addBoundSymbols(scope, item.target);
    } else if (item.typename === 'FromImport') {
      scope = addBoundSymbols(scope, item.names);
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

/**
 * Collect only parameter NAMES from a Macro.args NodeList. This is the set of
 * names bound inside the macro body — positional Symbols and `Pair.key`
 * Symbols inside `KeywordArgs`. Default-value expressions (`Pair.value`) are
 * *not* bindings and must be walked separately as references in the outer
 * scope.
 */
function collectMacroParamNames(argsNode: unknown): string[] {
  const names: string[] = [];
  if (!isNunjucksAstNode(argsNode) || !Array.isArray(argsNode.children)) {
    return names;
  }
  for (const child of argsNode.children) {
    if (!isNunjucksAstNode(child)) {
      continue;
    }
    if (child.typename === 'Symbol' && typeof child.value === 'string') {
      names.push(child.value);
      continue;
    }
    if (child.typename === 'KeywordArgs' && Array.isArray(child.children)) {
      for (const pair of child.children) {
        if (
          isNunjucksAstNode(pair) &&
          pair.typename === 'Pair' &&
          isNunjucksAstNode(pair.key) &&
          pair.key.typename === 'Symbol' &&
          typeof pair.key.value === 'string'
        ) {
          names.push(pair.key.value);
        }
      }
    }
  }
  return names;
}

function macroNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: string,
  boundSymbols: ReadonlySet<string>,
): boolean {
  // Walk the arg list with a scope that shadows only param names (not their
  // default-value expressions). This catches references like
  // `{% macro render(x=_conversation) %}` where `_conversation` in the default
  // is a real symbol read evaluated at call time.
  const paramNames = collectMacroParamNames(node.args);
  const argScope = new Set(boundSymbols);
  for (const name of paramNames) {
    argScope.add(name);
  }
  if (astChildReferencesVariable(node, 'args', variableName, argScope)) {
    return true;
  }

  // Walk the body with the full macro scope (outer + param names + macro name).
  const macroScope = new Set(argScope);
  if (
    isNunjucksAstNode(node.name) &&
    node.name.typename === 'Symbol' &&
    typeof node.name.value === 'string'
  ) {
    macroScope.add(node.name.value);
  }
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

function fromImportNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: string,
  boundSymbols: ReadonlySet<string>,
): boolean {
  // `{% from template import a, b as c %}` — the template expression may
  // reference variables, but the `names` list introduces local bindings
  // (both plain and aliased) and must never be walked as references.
  return astChildReferencesVariable(node, 'template', variableName, boundSymbols);
}

function blockNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: string,
  boundSymbols: ReadonlySet<string>,
): boolean {
  // `{% block name %}...{% endblock %}` — `name` is a template-inheritance
  // label, not a variable reference. Only the body can reference variables.
  return astChildReferencesVariable(node, 'body', variableName, boundSymbols);
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

  if (node.typename === 'FromImport') {
    return fromImportNodeReferencesVariable(node, variableName, boundSymbols);
  }

  if (node.typename === 'Block') {
    return blockNodeReferencesVariable(node, variableName, boundSymbols);
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
 * Detailed result for {@link analyzeTemplateReference}. `parsed` is `false`
 * only when the Nunjucks parser threw or its private export is missing; in
 * that case `referenced` is set conservatively from a textual substring check
 * so callers can preserve the old substring-match safety envelope without
 * memoizing a parse failure.
 */
export type TemplateReferenceResult = {
  referenced: boolean;
  parsed: boolean;
};

/**
 * Classify whether a template references `variableName` as a real Nunjucks
 * expression symbol, and surface whether the template parsed successfully.
 *
 * Callers that cache results should avoid caching when `parsed` is `false`,
 * otherwise a transient parse failure would poison the cache for the lifetime
 * of the process.
 */
export function analyzeTemplateReference(
  template: string,
  variableName: string,
): TemplateReferenceResult {
  if (!variableName || !template.includes(variableName)) {
    return { referenced: false, parsed: true };
  }

  const parseResult = parseNunjucksTemplate(template);
  if (!parseResult.ok) {
    return { referenced: true, parsed: false };
  }
  return {
    referenced: astReferencesVariable(parseResult.ast, variableName),
    parsed: true,
  };
}

/**
 * Check whether a Nunjucks template references a variable as a real expression
 * symbol (not a string literal, comment, object key, filter/test name, property
 * access, macro/for/set binding, or `{% import %}` alias).
 *
 * If parsing fails, returns `true` whenever the template textually contains
 * `variableName`. This preserves the safety envelope of the old substring-based
 * check so callers that gate serial-only behavior on this result do not
 * silently downgrade to parallel execution when a template is malformed.
 */
export function templateReferencesVariable(template: string, variableName: string): boolean {
  return analyzeTemplateReference(template, variableName).referenced;
}
