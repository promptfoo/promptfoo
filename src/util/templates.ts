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
    logger.debug('[templates] nunjucks parse failed; falling back to conservative detection', {
      error: err instanceof Error ? err.message : String(err),
    });
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
    (isForLikeNode(parent.node) && parent.field === 'name') ||
    (parent.node.typename === 'Macro' && parent.field === 'name') ||
    (parent.node.typename === 'Import' && parent.field === 'target') ||
    (parent.node.typename === 'FromImport' && parent.field === 'names')
  );
}

function getSymbolName(node: unknown): string | undefined {
  return isNunjucksAstNode(node) && node.typename === 'Symbol' && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function collectBindingNames(node: unknown): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectBindingNames(item));
  }

  const symbolName = getSymbolName(node);
  if (symbolName) {
    return [symbolName];
  }

  if (!isNunjucksAstNode(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children.flatMap((child) => collectBindingNames(child));
}

function addBindingNames(scope: ReadonlySet<string>, node: unknown): Set<string> {
  const nextScope = new Set(scope);
  for (const name of collectBindingNames(node)) {
    nextScope.add(name);
  }
  return nextScope;
}

function addNamesToScope(scope: ReadonlySet<string>, names: readonly string[]): Set<string> {
  const nextScope = new Set(scope);
  for (const name of names) {
    nextScope.add(name);
  }
  return nextScope;
}

function collectFromImportBindingNames(namesNode: unknown): string[] {
  if (!isNunjucksAstNode(namesNode) || !Array.isArray(namesNode.children)) {
    return [];
  }

  const names: string[] = [];
  for (const child of namesNode.children) {
    const plainImportName = getSymbolName(child);
    if (plainImportName) {
      names.push(plainImportName);
      continue;
    }

    if (isNunjucksAstNode(child) && child.typename === 'Pair') {
      const aliasName = getSymbolName(child.value);
      if (aliasName) {
        names.push(aliasName);
      }
    }
  }
  return names;
}

function isForLikeNode(node: NunjucksAstNode): boolean {
  return node.typename === 'For' || node.typename === 'AsyncEach' || node.typename === 'AsyncAll';
}

function collectAstChildReferences(
  node: NunjucksAstNode,
  field: string,
  boundSymbols: ReadonlySet<string>,
  references: Set<string>,
): void {
  const child = node[field];
  if (Array.isArray(child)) {
    for (const item of child) {
      if (isNunjucksAstNode(item)) {
        collectAstReferences(item, { field, node }, boundSymbols, references);
      }
    }
  } else if (isNunjucksAstNode(child)) {
    collectAstReferences(child, { field, node }, boundSymbols, references);
  }
}

function collectSignatureReferences(
  argsNode: unknown,
  boundSymbols: ReadonlySet<string>,
  references: Set<string>,
): string[] {
  const paramNames: string[] = [];
  if (!isNunjucksAstNode(argsNode) || !Array.isArray(argsNode.children)) {
    return paramNames;
  }

  const defaultScope = new Set(boundSymbols);
  for (const child of argsNode.children) {
    if (!isNunjucksAstNode(child)) {
      continue;
    }
    const positionalParamName = getSymbolName(child);
    if (positionalParamName) {
      paramNames.push(positionalParamName);
      defaultScope.add(positionalParamName);
      continue;
    }
    if (child.typename === 'KeywordArgs' && Array.isArray(child.children)) {
      for (const pair of child.children) {
        if (!isNunjucksAstNode(pair) || pair.typename !== 'Pair') {
          continue;
        }
        collectAstChildReferences(pair, 'value', defaultScope, references);
        const keywordParamName = getSymbolName(pair.key);
        if (keywordParamName) {
          paramNames.push(keywordParamName);
          defaultScope.add(keywordParamName);
        }
      }
      continue;
    }
    collectAstReferences(child, { field: 'children', node: argsNode }, defaultScope, references);
  }
  return paramNames;
}

function collectAstNodeListReferences(
  nodes: readonly unknown[],
  parent: NunjucksParentContext,
  boundSymbols: ReadonlySet<string>,
  references: Set<string>,
): void {
  let scope = new Set(boundSymbols);
  for (const item of nodes) {
    if (!isNunjucksAstNode(item)) {
      continue;
    }
    collectAstReferences(item, parent, scope, references);
    if (item.typename === 'Set') {
      scope = addBindingNames(scope, item.targets);
    } else if (item.typename === 'Macro') {
      scope = addBindingNames(scope, item.name);
    } else if (item.typename === 'Import') {
      scope = addBindingNames(scope, item.target);
    } else if (item.typename === 'FromImport') {
      scope = addNamesToScope(scope, collectFromImportBindingNames(item.names));
    }
  }
}

function collectAstReferences(
  node: NunjucksAstNode,
  parent: NunjucksParentContext | undefined,
  boundSymbols: ReadonlySet<string>,
  references: Set<string>,
): void {
  if (node.typename === 'Symbol') {
    if (
      typeof node.value === 'string' &&
      !boundSymbols.has(node.value) &&
      !isNonReferenceSymbol(parent)
    ) {
      references.add(node.value);
    }
    return;
  }

  if ((node.typename === 'Root' || node.typename === 'NodeList') && Array.isArray(node.children)) {
    collectAstNodeListReferences(
      node.children,
      { field: 'children', node },
      boundSymbols,
      references,
    );
    return;
  }

  if (isForLikeNode(node)) {
    collectAstChildReferences(node, 'arr', boundSymbols, references);
    collectAstChildReferences(node, 'body', addBindingNames(boundSymbols, node.name), references);
    collectAstChildReferences(node, 'else_', boundSymbols, references);
    return;
  }

  if (node.typename === 'Macro') {
    const paramNames = collectSignatureReferences(node.args, boundSymbols, references);
    const macroScope = addNamesToScope(boundSymbols, paramNames);
    const macroName = getSymbolName(node.name);
    if (macroName) {
      macroScope.add(macroName);
    }
    collectAstChildReferences(node, 'body', macroScope, references);
    return;
  }

  if (node.typename === 'Is') {
    collectAstChildReferences(node, 'left', boundSymbols, references);
    if (isNunjucksAstNode(node.right)) {
      if (node.right.typename === 'FunCall') {
        collectAstChildReferences(node.right, 'args', boundSymbols, references);
      } else if (node.right.typename !== 'Symbol') {
        collectAstReferences(node.right, { field: 'right', node }, boundSymbols, references);
      }
    }
    return;
  }

  if (node.typename === 'Set') {
    collectAstChildReferences(node, 'value', boundSymbols, references);
    collectAstChildReferences(node, 'body', boundSymbols, references);
    return;
  }

  if (node.typename === 'FromImport') {
    collectAstChildReferences(node, 'template', boundSymbols, references);
    return;
  }

  if (node.typename === 'Block') {
    collectAstChildReferences(node, 'body', boundSymbols, references);
    return;
  }

  if (node.typename === 'Caller') {
    const paramNames = collectSignatureReferences(node.args, boundSymbols, references);
    collectAstChildReferences(node, 'body', addNamesToScope(boundSymbols, paramNames), references);
    return;
  }

  for (const field of node.fields ?? []) {
    collectAstChildReferences(node, field, boundSymbols, references);
  }
}

function astReferencesVariable(
  node: NunjucksAstNode,
  variableName: string,
  parent?: NunjucksParentContext,
  boundSymbols: ReadonlySet<string> = new Set(),
): boolean {
  const references = new Set<string>();
  collectAstReferences(node, parent, boundSymbols, references);
  return references.has(variableName);
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

/** Analyze several candidate roots with a single Nunjucks parse. */
export function analyzeTemplateReferences(
  template: string,
  variableNames: Iterable<string>,
): { parsed: boolean; referenced: Set<string> } {
  const candidates = Array.from(new Set(variableNames)).filter(Boolean);
  const parseResult = parseNunjucksTemplate(template);
  if (!parseResult.ok) {
    return {
      parsed: false,
      referenced: new Set(candidates.filter((variableName) => template.includes(variableName))),
    };
  }

  const allReferences = new Set<string>();
  collectAstReferences(parseResult.ast, undefined, new Set(), allReferences);

  return {
    parsed: true,
    referenced: new Set(candidates.filter((variableName) => allReferences.has(variableName))),
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
