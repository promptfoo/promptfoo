import nunjucks from 'nunjucks';
import { getEnvBool, getEnvOverrides, isTemplateProcessEnvDisabled } from '../envars';
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

// The scope walker can either stop at one requested name or collect every
// unbound name into a Set during the same traversal.
type ReferenceTarget = string | Set<string>;

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

function addBindingNamesInPlace(scope: Set<string>, node: unknown): void {
  for (const name of collectBindingNames(node)) {
    scope.add(name);
  }
}

function addNamesToScope(scope: ReadonlySet<string>, names: readonly string[]): Set<string> {
  const nextScope = new Set(scope);
  for (const name of names) {
    nextScope.add(name);
  }
  return nextScope;
}

function addNamesToScopeInPlace(scope: Set<string>, names: readonly string[]): void {
  for (const name of names) {
    scope.add(name);
  }
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

function astNodeListReferencesVariable(
  nodes: readonly unknown[],
  variableName: ReferenceTarget,
  parent: NunjucksParentContext,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const scope = new Set(boundSymbols);
  for (const item of nodes) {
    if (!isNunjucksAstNode(item)) {
      continue;
    }
    if (astReferencesVariable(item, variableName, parent, scope)) {
      return true;
    }
    if (item.typename === 'Set') {
      addBindingNamesInPlace(scope, item.targets);
    } else if (item.typename === 'Macro') {
      addBindingNamesInPlace(scope, item.name);
    } else if (item.typename === 'Import') {
      addBindingNamesInPlace(scope, item.target);
    } else if (item.typename === 'FromImport') {
      addNamesToScopeInPlace(scope, collectFromImportBindingNames(item.names));
    }
  }
  return false;
}

function astChildReferencesVariable(
  node: NunjucksAstNode,
  field: string,
  variableName: ReferenceTarget,
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

function isForLikeNode(node: NunjucksAstNode): boolean {
  return node.typename === 'For' || node.typename === 'AsyncEach' || node.typename === 'AsyncAll';
}

function forLikeNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const loopScope = addBindingNames(boundSymbols, node.name);
  // Nunjucks exposes the frame-local `loop` object alongside the explicit loop
  // variable. It is neither an external dependency nor an engine global.
  loopScope.add('loop');
  return (
    astChildReferencesVariable(node, 'arr', variableName, boundSymbols) ||
    astChildReferencesVariable(node, 'body', variableName, loopScope) ||
    astChildReferencesVariable(node, 'else_', variableName, boundSymbols)
  );
}

/**
 * Walk a Nunjucks macro/caller signature left-to-right. Positional args and
 * earlier keyword defaults are visible to later defaults, but the current
 * keyword is not bound until its own default value has been evaluated.
 */
function analyzeSignatureArgs(
  argsNode: unknown,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): { paramNames: string[]; referencesVariable: boolean } {
  const paramNames: string[] = [];
  if (!isNunjucksAstNode(argsNode) || !Array.isArray(argsNode.children)) {
    return { paramNames, referencesVariable: false };
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
        const keywordParamName =
          isNunjucksAstNode(pair) && pair.typename === 'Pair' ? getSymbolName(pair.key) : undefined;
        if (
          isNunjucksAstNode(pair) &&
          pair.typename === 'Pair' &&
          astChildReferencesVariable(pair, 'value', variableName, defaultScope)
        ) {
          return { paramNames, referencesVariable: true };
        }
        if (keywordParamName) {
          paramNames.push(keywordParamName);
          defaultScope.add(keywordParamName);
        }
      }
      continue;
    }
    if (
      astReferencesVariable(
        child,
        variableName,
        { field: 'children', node: argsNode },
        defaultScope,
      )
    ) {
      return { paramNames, referencesVariable: true };
    }
  }

  return { paramNames, referencesVariable: false };
}

function macroNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const { paramNames, referencesVariable } = analyzeSignatureArgs(
    node.args,
    variableName,
    boundSymbols,
  );
  if (referencesVariable) {
    return true;
  }

  // Walk the body with the full macro scope (outer + param names + macro name
  // + the implicit caller supplied by a call block).
  const macroScope = addNamesToScope(boundSymbols, paramNames);
  const macroName = getSymbolName(node.name);
  if (macroName) {
    macroScope.add(macroName);
  }
  macroScope.add('caller');
  return astChildReferencesVariable(node, 'body', variableName, macroScope);
}

function isNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  if (astChildReferencesVariable(node, 'left', variableName, boundSymbols)) {
    return true;
  }

  const right = node.right;
  if (!isNunjucksAstNode(right)) {
    return false;
  }

  if (right.typename === 'FunCall') {
    return astChildReferencesVariable(right, 'args', variableName, boundSymbols);
  }

  return (
    right.typename !== 'Symbol' &&
    astReferencesVariable(right, variableName, { field: 'right', node }, boundSymbols)
  );
}

function setNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  return (
    astChildReferencesVariable(node, 'value', variableName, boundSymbols) ||
    astChildReferencesVariable(node, 'body', variableName, boundSymbols)
  );
}

function fromImportNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  // `{% from template import a, b as c %}` — the template expression may
  // reference variables, but the `names` list introduces local bindings
  // (both plain and aliased) and must never be walked as references.
  return astChildReferencesVariable(node, 'template', variableName, boundSymbols);
}

function blockNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  // `{% block name %}...{% endblock %}` — `name` is a template-inheritance
  // label, not a variable reference. Only the body can reference variables.
  return astChildReferencesVariable(node, 'body', variableName, boundSymbols);
}

function callerNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const { paramNames, referencesVariable } = analyzeSignatureArgs(
    node.args,
    variableName,
    boundSymbols,
  );
  if (referencesVariable) {
    return true;
  }

  const callerScope = addNamesToScope(boundSymbols, paramNames);
  return astChildReferencesVariable(node, 'body', variableName, callerScope);
}

function astFieldsReferenceVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  return (node.fields ?? []).some((field) =>
    astChildReferencesVariable(node, field, variableName, boundSymbols),
  );
}

function astReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  parent?: NunjucksParentContext,
  boundSymbols: ReadonlySet<string> = new Set(),
): boolean {
  if (node.typename === 'Symbol' && typeof node.value === 'string') {
    const isReference = !boundSymbols.has(node.value) && !isNonReferenceSymbol(parent);
    if (typeof variableName === 'string') {
      if (node.value === variableName) {
        return isReference;
      }
    } else if (isReference) {
      variableName.add(node.value);
    }
  }

  if ((node.typename === 'Root' || node.typename === 'NodeList') && Array.isArray(node.children)) {
    return astNodeListReferencesVariable(
      node.children,
      variableName,
      { field: 'children', node },
      boundSymbols,
    );
  }

  if (isForLikeNode(node)) {
    return forLikeNodeReferencesVariable(node, variableName, boundSymbols);
  }

  if (node.typename === 'Macro') {
    return macroNodeReferencesVariable(node, variableName, boundSymbols);
  }

  if (node.typename === 'Is') {
    return isNodeReferencesVariable(node, variableName, boundSymbols);
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

  if (node.typename === 'Caller') {
    return callerNodeReferencesVariable(node, variableName, boundSymbols);
  }

  return astFieldsReferenceVariable(node, variableName, boundSymbols);
}

// Cached engines and imported macros share this view. Resolve keys from the current
// async scope; enumerate process.env only when a template actually iterates it.
const templateEnv: Record<string, string | undefined> = new Proxy(
  {},
  {
    get(_target, key) {
      if (typeof key !== 'string') {
        return undefined;
      }
      const overrides = getEnvOverrides();
      if (overrides?.[key] !== undefined && Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }
      return isTemplateProcessEnvDisabled()
        ? undefined
        : (getEnvOverrides('file')?.[key] ?? process.env[key]);
    },
    has(_target, key) {
      const overrides = getEnvOverrides();
      return (
        typeof key === 'string' &&
        ((overrides?.[key] !== undefined && Object.prototype.hasOwnProperty.call(overrides, key)) ||
          (!isTemplateProcessEnvDisabled() &&
            (getEnvOverrides('file')?.[key] !== undefined ||
              Object.prototype.hasOwnProperty.call(process.env, key))))
      );
    },
    ownKeys() {
      return [
        ...new Set([
          ...(isTemplateProcessEnvDisabled()
            ? []
            : [...Object.keys(process.env), ...Object.keys(getEnvOverrides('file') ?? {})]),
          ...Object.keys(getEnvOverrides() ?? {}),
        ]),
      ];
    },
    getOwnPropertyDescriptor(_target, key) {
      return typeof key === 'string' && key in templateEnv
        ? { value: templateEnv[key], enumerable: true, configurable: true }
        : undefined;
    },
  },
);

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
  const env = nunjucks.configure({
    autoescape: false,
    throwOnUndefined,
  });

  env.addGlobal('env', templateEnv);
  const renderString = env.renderString.bind(env);
  env.renderString = ((
    template: string,
    context?: Record<string, unknown> | nunjucks.TemplateCallback<string>,
    callback?: nunjucks.TemplateCallback<string>,
  ) => {
    if (typeof context === 'function') {
      callback = context;
      context = undefined;
    }
    if (!isGrader && getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
      if (callback) {
        callback(null, template);
        return;
      }
      return template;
    }
    return renderString(template, { env: templateEnv, ...context }, callback);
  }) as typeof env.renderString;

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

let globalsEngine: nunjucks.Environment | undefined;

/** Check both Nunjucks built-ins and globals installed on the configured engine. */
export function isNunjucksGlobal(name: string): boolean {
  globalsEngine ??= getNunjucksEngine();
  // getGlobal throws for an unknown name. Read the same table directly so
  // ordinary undefined variables stay on the non-exceptional path.
  const { globals } = globalsEngine as unknown as { globals: Record<string, unknown> };
  return globals[name] !== undefined;
}

function isTemplateWhitespace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char);
}

function skipTemplateWhitespace(template: string, start: number, end: number): number {
  let index = start;
  while (index < end && isTemplateWhitespace(template[index])) {
    index++;
  }
  return index;
}

function stripClosedComments(template: string): string {
  const chunks: string[] = [];
  let cursor = 0;
  let start = template.indexOf('{#');
  while (start !== -1) {
    const end = template.indexOf('#}', start + 2);
    if (end === -1) {
      break;
    }
    chunks.push(template.slice(cursor, start));
    cursor = end + 2;
    start = template.indexOf('{#', cursor);
  }
  chunks.push(template.slice(cursor));
  return chunks.join('');
}

type OutputRejectionCache = { end: number; at: number };

function readOutputVariable(
  template: string,
  start: number,
  end: number,
  rejectionCache: OutputRejectionCache,
): string | undefined {
  let index = skipTemplateWhitespace(template, start + 2, end);
  const tokenStart = index;
  while (index < end && !/[{}\s|]/.test(template[index]!)) {
    index++;
  }
  const variable = template.slice(tokenStart, index);
  index = skipTemplateWhitespace(template, index, end);
  if (variable && index === end) {
    return variable;
  }
  if (!variable || template[index] !== '|') {
    return undefined;
  }

  index++;
  if (rejectionCache.end === end && rejectionCache.at >= index) {
    return undefined;
  }
  let hasFilterContent = false;
  for (; index < end; index++) {
    if (template[index] === '}') {
      rejectionCache.end = end;
      rejectionCache.at = index;
      return undefined;
    }
    hasFilterContent = true;
  }
  return hasFilterContent ? variable : undefined;
}

function readBlockVariable(template: string, start: number, end: number): string | undefined {
  let index = skipTemplateWhitespace(template, start + 2, end);
  const keyword = template.startsWith('if', index)
    ? 'if'
    : template.startsWith('for', index)
      ? 'for'
      : '';
  if (!keyword || !isTemplateWhitespace(template[index + keyword.length])) {
    return undefined;
  }

  index = skipTemplateWhitespace(template, index + keyword.length, end);
  const tokenStart = index;
  while (index < end && !/[{}\s]/.test(template[index]!)) {
    index++;
  }
  return index > tokenStart ? template.slice(tokenStart, index) : undefined;
}

/**
 * Parse Nunjucks template to extract variables.
 * @param template - The Nunjucks template string.
 * @returns An array of variables used in the template.
 */
export function extractVariablesFromTemplate(template: string): string[] {
  const variableSet = new Set<string>();
  // Remove only closed comments, matching the old non-greedy regex without
  // backtracking through an unterminated comment.
  template = stripClosedComments(template);

  // Scan tags directly instead of using a body-wide `.*?`. Close positions are
  // cached across malformed nested openers, so an unterminated long tag is one
  // linear pass rather than quadratic regex backtracking.
  let cursor = 0;
  const openerPattern = /\{\{|\{%/g;
  let outputEnd: number | undefined;
  let blockEnd: number | undefined;
  const rejectionCache: OutputRejectionCache = { end: -1, at: -1 };
  while (cursor < template.length) {
    openerPattern.lastIndex = cursor;
    const opener = openerPattern.exec(template);
    if (!opener) {
      break;
    }
    const start = opener.index;
    const isOutput = opener[0] === '{{';
    let end = isOutput ? outputEnd : blockEnd;
    if (end === undefined || (end >= 0 && end < start + 2)) {
      end = template.indexOf(isOutput ? '}}' : '%}', start + 2);
      if (isOutput) {
        outputEnd = end;
      } else {
        blockEnd = end;
      }
    }
    if (end === -1) {
      // The suffix has no close for this tag kind. Keep -1 cached so later
      // malformed openers do not each rescan the same suffix.
      cursor = start + 2;
      continue;
    }

    const variable = isOutput
      ? readOutputVariable(template, start, end, rejectionCache)
      : readBlockVariable(template, start, end);
    if (variable) {
      variableSet.add(variable);
      cursor = end + 2;
    } else {
      // A malformed outer tag can contain a complete inner tag. Resume after
      // this opener instead of skipping the first close, preserving the old
      // conservative behavior for nested placeholders.
      cursor = start + 2;
    }
  }

  // Handle for loops separately
  let match;
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

function collectExpressionReferences(
  node: NunjucksAstNode,
  parent: NunjucksParentContext | undefined,
  references: Set<string>,
): void {
  if (node.typename === 'Is') {
    if (isNunjucksAstNode(node.left)) {
      collectExpressionReferences(node.left, { field: 'left', node }, references);
    }
    const right = node.right;
    if (!isNunjucksAstNode(right)) {
      return;
    }
    if (right.typename === 'FunCall') {
      if (isNunjucksAstNode(right.args)) {
        collectExpressionReferences(right.args, { field: 'args', node: right }, references);
      }
    } else if (right.typename !== 'Symbol') {
      collectExpressionReferences(right, { field: 'right', node }, references);
    }
    return;
  }

  if (node.typename === 'Symbol' && typeof node.value === 'string') {
    if (!isNonReferenceSymbol(parent)) {
      references.add(node.value);
    }
    return;
  }

  for (const field of node.fields ?? []) {
    const child = node[field];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNunjucksAstNode(item)) {
          collectExpressionReferences(item, { field, node }, references);
        }
      }
    } else if (isNunjucksAstNode(child)) {
      collectExpressionReferences(child, { field, node }, references);
    }
  }
}

/**
 * Collect real symbols from a Nunjucks expression with one AST parse.
 * String literals, filter names, object keys, and property names are excluded.
 * Returns undefined when parsing fails so callers can choose a conservative fallback.
 */
export function extractVariablesFromExpression(template: string): string[] | undefined {
  const parseResult = parseNunjucksTemplate(template);
  if (!parseResult.ok) {
    return undefined;
  }
  const references = new Set<string>();
  collectExpressionReferences(parseResult.ast, undefined, references);
  return Array.from(references);
}

function astLoadsExternalContext(node: unknown): boolean {
  if (!isNunjucksAstNode(node)) {
    return false;
  }
  if (['Include', 'Import', 'FromImport', 'Extends'].includes(node.typename!)) {
    return true;
  }
  return (node.fields ?? []).some((field) => {
    const child = node[field];
    return Array.isArray(child)
      ? child.some(astLoadsExternalContext)
      : astLoadsExternalContext(child);
  });
}

/**
 * Return whether a template loads another template whose references are not
 * visible in this AST. Parse failure is indeterminate and uses the same
 * conservative answer, so callers do not suppress errors on unseen variables.
 */
export function templateLoadsExternalContext(template: string): boolean {
  const parseResult = parseNunjucksTemplate(template);
  return !parseResult.ok || astLoadsExternalContext(parseResult.ast);
}

/**
 * Collect all unbound expression symbols with one parse and one scope-aware
 * AST walk. Returns undefined on parse failure so callers can retain their
 * conservative textual fallback.
 */
export function extractUnboundVariablesFromTemplate(template: string): string[] | undefined {
  const parseResult = parseNunjucksTemplate(template);
  if (!parseResult.ok) {
    return undefined;
  }
  const references = new Set<string>();
  astReferencesVariable(parseResult.ast, references);
  return Array.from(references);
}
