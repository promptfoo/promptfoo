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

type RequiredReferenceTarget = {
  references: Set<string>;
  excludeOrOperands: true;
};

// The scope walker can stop at one requested name, collect every unbound name,
// or collect only names whose evaluation requires a supplied value.
type ReferenceTarget = string | Set<string> | RequiredReferenceTarget;

function disposableIterator<T>(iterator: IterableIterator<T>): SetIterator<T> {
  return {
    next: () => iterator.next(),
    [Symbol.dispose]: () => {},
    [Symbol.iterator]() {
      return this;
    },
  };
}

const MAX_MACRO_ANALYSIS_DEPTH = 100;
let macroAnalysisDepth = 0;

type DeferredMacro = {
  node: NunjucksAstNode;
  paramNames: string[];
  paramNameSet: ReadonlySet<string>;
  definitionScope: ReadonlySet<string>;
  called: boolean;
  analyzing: boolean;
  usesCaller: boolean;
};

type ConditionalSummary = {
  setBindings: Set<string>;
  macroDeclarations: Set<string>;
  macroCandidates: Map<string, ReadonlySet<DeferredMacro>>;
};

type MacroAnalysisMemo = {
  results: Map<DeferredMacro, Set<string>>;
  remainingVisits: number;
};

class TemplateAnalysisLimitError extends Error {}

function consumeAnalysisWork(memo?: MacroAnalysisMemo): void {
  if (memo && --memo.remainingVisits < 0) {
    throw new TemplateAnalysisLimitError('Template dependency analysis exceeded its work limit');
  }
}

class LinkedScope implements ReadonlySet<string> {
  private readonly names = new Set<string>();
  private readonly macros = new Map<string, Set<DeferredMacro>>();
  private fallbackMacroMemo?: MacroAnalysisMemo;

  constructor(
    private readonly parent?: ReadonlySet<string>,
    names: Iterable<string> = [],
  ) {
    this.fallbackMacroMemo = parent instanceof LinkedScope ? parent.macroAnalysisMemo() : undefined;
    for (const name of names) {
      this.names.add(name);
    }
  }

  get size(): number {
    return Array.from(this).length;
  }

  has(value: string): boolean {
    return this.names.has(value) || this.parent?.has(value) === true;
  }

  add(value: string): this {
    this.names.add(value);
    return this;
  }

  registerMacro(name: string, definition: DeferredMacro, invalidateMemo = true): void {
    this.macros.set(name, new Set([definition]));
    if (invalidateMemo) {
      this.macroAnalysisMemo()?.results.clear();
    }
  }

  registerMacroCandidates(
    name: string,
    definitions: ReadonlySet<DeferredMacro>,
    invalidateMemo = true,
  ): void {
    this.macros.set(name, new Set(definitions));
    if (invalidateMemo) {
      this.macroAnalysisMemo()?.results.clear();
    }
  }

  removeMacroBindings(node: unknown): void {
    for (const name of collectBindingNames(node)) {
      this.removeMacro(name);
    }
  }

  rebindMacros(targets: unknown, value: unknown): void {
    const sourceName = getSymbolName(value);
    const sourceMacros = sourceName ? this.findMacros(sourceName) : undefined;
    this.removeMacroBindings(targets);
    if (sourceMacros) {
      for (const name of collectBindingNames(targets)) {
        this.registerMacroCandidates(name, sourceMacros);
      }
    }
  }

  removeMacro(name: string): void {
    if (this.macros.delete(name)) {
      this.macroAnalysisMemo()?.results.clear();
    }
  }

  findMacros(name: string): ReadonlySet<DeferredMacro> | undefined {
    if (this.names.has(name)) {
      return this.macros.get(name);
    }
    return this.parent instanceof LinkedScope ? this.parent.findMacros(name) : undefined;
  }

  localMacros(): DeferredMacro[] {
    const macros = new Set<DeferredMacro>();
    for (const candidates of this.macros.values()) {
      for (const macro of candidates) {
        macros.add(macro);
      }
    }
    return Array.from(macros);
  }

  macroAnalysisMemo(): MacroAnalysisMemo | undefined {
    return (
      this.fallbackMacroMemo ??
      (this.parent instanceof LinkedScope ? this.parent.macroAnalysisMemo() : undefined)
    );
  }

  replaceMacroAnalysisMemo(memo?: MacroAnalysisMemo): MacroAnalysisMemo | undefined {
    const previous = this.fallbackMacroMemo;
    this.fallbackMacroMemo = memo;
    return previous;
  }

  keys(): SetIterator<string> {
    const iterator = function* (this: LinkedScope) {
      yield* this.names;
      if (this.parent) {
        for (const name of this.parent) {
          if (!this.names.has(name)) {
            yield name;
          }
        }
      }
    }.call(this);
    return disposableIterator(iterator);
  }

  values(): SetIterator<string> {
    return disposableIterator(this.keys());
  }

  entries(): SetIterator<[string, string]> {
    const iterator = function* (this: LinkedScope) {
      for (const name of this) {
        yield [name, name] as [string, string];
      }
    }.call(this);
    return disposableIterator(iterator);
  }

  forEach(
    callbackfn: (value: string, value2: string, set: ReadonlySet<string>) => void,
    thisArg?: unknown,
  ): void {
    for (const value of this) {
      callbackfn.call(thisArg, value, value, this);
    }
  }

  [Symbol.iterator](): SetIterator<string> {
    return this.keys();
  }
}

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

function addBindingNames(scope: ReadonlySet<string>, node: unknown): LinkedScope {
  const nextScope = new LinkedScope(scope);
  for (const name of collectBindingNames(node)) {
    nextScope.add(name);
  }
  return nextScope;
}

function addBindingNamesInPlace(scope: LinkedScope, node: unknown): void {
  for (const name of collectBindingNames(node)) {
    scope.add(name);
  }
}

function addNamesToScope(scope: ReadonlySet<string>, names: readonly string[]): LinkedScope {
  const nextScope = new LinkedScope(scope);
  for (const name of names) {
    nextScope.add(name);
  }
  return nextScope;
}

function addNamesToScopeInPlace(scope: LinkedScope, names: readonly string[]): void {
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

function countAstNodes(nodes: readonly unknown[]): number {
  const pending = [...nodes];
  let count = 0;
  while (pending.length > 0) {
    const node = pending.pop();
    if (!isNunjucksAstNode(node)) {
      continue;
    }
    count++;
    for (const field of node.fields ?? []) {
      const child = node[field];
      if (Array.isArray(child)) {
        for (const item of child) {
          pending.push(item);
        }
      } else {
        pending.push(child);
      }
    }
  }
  return count;
}

function createConditionalSummary(): ConditionalSummary {
  return { setBindings: new Set(), macroDeclarations: new Set(), macroCandidates: new Map() };
}

function updateStatementBindings(
  item: NunjucksAstNode,
  scope: LinkedScope,
  summary?: ConditionalSummary,
): void {
  if (item.typename === 'Set') {
    scope.rebindMacros(item.targets, item.value);
    addBindingNamesInPlace(scope, item.targets);
    if (summary) {
      for (const name of collectBindingNames(item.targets)) {
        summary.setBindings.add(name);
      }
    }
  } else if (item.typename === 'Macro') {
    addBindingNamesInPlace(scope, item.name);
    if (summary) {
      for (const name of collectBindingNames(item.name)) {
        summary.setBindings.add(name);
        summary.macroDeclarations.add(name);
      }
    }
  } else if (item.typename === 'Import') {
    scope.removeMacroBindings(item.target);
    addBindingNamesInPlace(scope, item.target);
  } else if (item.typename === 'FromImport') {
    const names = collectFromImportBindingNames(item.names);
    for (const name of names) {
      scope.removeMacro(name);
    }
    addNamesToScopeInPlace(scope, names);
  }
}

function mergeConditionalBindings(
  target: ConditionalSummary | undefined,
  source: ConditionalSummary,
): void {
  if (!target) {
    return;
  }
  for (const name of source.setBindings) {
    target.setBindings.add(name);
  }
  for (const name of source.macroDeclarations) {
    target.macroDeclarations.add(name);
  }
}

function collectSummaryMacroCandidates(summary: ConditionalSummary, scope: LinkedScope): void {
  for (const name of summary.setBindings) {
    const candidates = scope.findMacros(name);
    if (candidates && candidates.size > 0) {
      summary.macroCandidates.set(name, candidates);
    }
  }
}

function astNodeListReferencesVariable(
  nodes: readonly unknown[],
  variableName: ReferenceTarget,
  parent: NunjucksParentContext,
  boundSymbols: ReadonlySet<string>,
  summary?: ConditionalSummary,
): boolean {
  const scope = new LinkedScope(boundSymbols);
  const previousMemo = scope.macroAnalysisMemo();
  if (previousMemo === undefined) {
    // Allow linear work on large ASTs without expanding small macro call trees exponentially.
    scope.replaceMacroAnalysisMemo({
      results: new Map(),
      remainingVisits: 10000 + 16 * countAstNodes(nodes),
    });
  }
  try {
    for (const item of nodes) {
      if (!isNunjucksAstNode(item)) {
        continue;
      }
      const nestedSummary =
        summary && item.typename === 'If' ? createConditionalSummary() : undefined;
      if (astReferencesVariable(item, variableName, parent, scope, nestedSummary)) {
        return true;
      }
      updateStatementBindings(item, scope, summary);
      if (nestedSummary) {
        mergeConditionalBindings(summary, nestedSummary);
      }
    }
    if (!(typeof variableName === 'object' && 'excludeOrOperands' in variableName)) {
      for (const macro of scope.localMacros()) {
        if (!macro.called && analyzeMacroBody(macro, variableName, scope.macroAnalysisMemo())) {
          return true;
        }
      }
    }
    if (summary) {
      collectSummaryMacroCandidates(summary, scope);
    }
    return false;
  } finally {
    scope.replaceMacroAnalysisMemo(previousMemo);
  }
}

function astChildReferencesVariable(
  node: NunjucksAstNode,
  field: string,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
  summary?: ConditionalSummary,
): boolean {
  const child = node[field];
  if (Array.isArray(child)) {
    return child.some(
      (item) =>
        isNunjucksAstNode(item) &&
        astReferencesVariable(item, variableName, { field, node }, boundSymbols, summary),
    );
  }
  return (
    isNunjucksAstNode(child) &&
    astReferencesVariable(child, variableName, { field, node }, boundSymbols, summary)
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

function isSuppliedParamName(
  suppliedParamNames: ReadonlySet<string> | undefined,
  paramName: string | undefined,
): boolean {
  return paramName !== undefined && suppliedParamNames?.has(paramName) === true;
}

/**
 * Walk a Nunjucks macro/caller signature left-to-right. Positional args and
 * earlier keyword defaults are visible to later defaults, but the current
 * keyword is not bound until its own default value has been evaluated.
 */
function analyzeSignatureArgs(
  argsNode: unknown,
  variableName: ReferenceTarget | undefined,
  boundSymbols: ReadonlySet<string>,
  suppliedParamNames?: ReadonlySet<string>,
): { paramNames: string[]; referencesVariable: boolean } {
  const paramNames: string[] = [];
  if (!isNunjucksAstNode(argsNode) || !Array.isArray(argsNode.children)) {
    return { paramNames, referencesVariable: false };
  }

  const defaultScope = new LinkedScope(boundSymbols);
  const memo = defaultScope.macroAnalysisMemo();
  for (const child of argsNode.children) {
    consumeAnalysisWork(memo);
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
        consumeAnalysisWork(memo);
        const keywordParamName =
          isNunjucksAstNode(pair) && pair.typename === 'Pair' ? getSymbolName(pair.key) : undefined;
        if (
          variableName &&
          !isSuppliedParamName(suppliedParamNames, keywordParamName) &&
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
      variableName &&
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

function collectSuppliedMacroParamNames(
  argsNode: unknown,
  macro: Pick<DeferredMacro, 'paramNames' | 'paramNameSet'>,
  memo?: MacroAnalysisMemo,
): Set<string> {
  const supplied = new Set<string>();
  if (!isNunjucksAstNode(argsNode) || !Array.isArray(argsNode.children)) {
    return supplied;
  }

  let positionalIndex = 0;
  for (const child of argsNode.children) {
    consumeAnalysisWork(memo);
    if (!isNunjucksAstNode(child)) {
      continue;
    }
    if (child.typename === 'KeywordArgs' && Array.isArray(child.children)) {
      for (const pair of child.children) {
        consumeAnalysisWork(memo);
        const name =
          isNunjucksAstNode(pair) && pair.typename === 'Pair' ? getSymbolName(pair.key) : undefined;
        if (name && macro.paramNameSet.has(name)) {
          supplied.add(name);
        }
      }
      continue;
    }
    const name = macro.paramNames[positionalIndex++];
    if (name) {
      supplied.add(name);
    }
  }
  return supplied;
}

function macroAnalysisMemoKey(suppliedParamNames?: ReadonlySet<string>): string {
  return suppliedParamNames ? Array.from(suppliedParamNames).sort().join('\0') : '';
}

function analyzeMacroBody(
  macro: DeferredMacro,
  variableName: ReferenceTarget,
  memo?: MacroAnalysisMemo,
  suppliedParamNames?: ReadonlySet<string>,
): boolean {
  const memoKey = macroAnalysisMemoKey(suppliedParamNames);
  if (memo?.results.get(macro)?.has(memoKey)) {
    return false;
  }
  if (macroAnalysisDepth >= MAX_MACRO_ANALYSIS_DEPTH) {
    throw new TemplateAnalysisLimitError('Template macro analysis exceeded its depth limit');
  }

  const wasAnalyzing = macro.analyzing;
  macro.analyzing = true;
  macroAnalysisDepth++;
  try {
    // Defaults and bodies see the definition frame's current bindings at each
    // call, not a declaration-time snapshot or the caller macro's local frame.
    const { referencesVariable } = analyzeSignatureArgs(
      macro.node.args,
      variableName,
      macro.definitionScope,
      suppliedParamNames,
    );
    if (referencesVariable) {
      return true;
    }
    // Reentrant calls can evaluate defaults even when their body is already active.
    if (wasAnalyzing) {
      return false;
    }

    const macroScope = addNamesToScope(macro.definitionScope, macro.paramNames);
    const macroName = getSymbolName(macro.node.name);
    if (macroName) {
      macroScope.add(macroName);
      // Initializing the implicit self binding does not rebind a visible definition.
      macroScope.registerMacro(macroName, macro, false);
    }
    macroScope.add('caller');
    const result = astChildReferencesVariable(macro.node, 'body', variableName, macroScope);
    if (!result && memo) {
      const memoKeys = memo.results.get(macro) ?? new Set<string>();
      memoKeys.add(memoKey);
      memo.results.set(macro, memoKeys);
    }
    return result;
  } finally {
    macroAnalysisDepth--;
    macro.analyzing = wasAnalyzing;
  }
}

function astUsesCaller(node: unknown, memo?: MacroAnalysisMemo): boolean {
  const pending = [node];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!isNunjucksAstNode(current)) {
      continue;
    }
    consumeAnalysisWork(memo);
    if (current.typename === 'Symbol' && current.value === 'caller') {
      return true;
    }
    for (const field of current.fields ?? []) {
      const child = current[field];
      if (Array.isArray(child)) {
        for (const item of child) {
          pending.push(item);
        }
      } else {
        pending.push(child);
      }
    }
  }
  return false;
}

function macroNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const { paramNames } = analyzeSignatureArgs(node.args, undefined, boundSymbols);
  const macro: DeferredMacro = {
    node,
    paramNames,
    paramNameSet: new Set(paramNames),
    definitionScope: boundSymbols,
    called: false,
    analyzing: false,
    usesCaller: astUsesCaller(
      node.body,
      boundSymbols instanceof LinkedScope ? boundSymbols.macroAnalysisMemo() : undefined,
    ),
  };
  const macroName = getSymbolName(node.name);
  if (macroName && boundSymbols instanceof LinkedScope) {
    boundSymbols.registerMacro(macroName, macro);
    return false;
  }

  return analyzeMacroBody(macro, variableName);
}

function isNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const right = node.right;
  if (
    typeof variableName === 'object' &&
    'excludeOrOperands' in variableName &&
    isNunjucksAstNode(right) &&
    right.typename === 'Symbol' &&
    (right.value === 'defined' || right.value === 'undefined')
  ) {
    return false;
  }

  if (astChildReferencesVariable(node, 'left', variableName, boundSymbols)) {
    return true;
  }

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
  // `name` is a template-inheritance label, not a variable reference. Nunjucks
  // supplies `super` from the block frame, so it is not an external dependency.
  const blockScope = addNamesToScope(boundSymbols, ['super']);
  return astChildReferencesVariable(node, 'body', variableName, blockScope);
}

function callerNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
  analyzeDeferred = false,
  suppliedParamNames?: ReadonlySet<string>,
): boolean {
  if (!analyzeDeferred && typeof variableName === 'object' && 'excludeOrOperands' in variableName) {
    // A call block packages its defaults and body as a deferred caller. They
    // are not reads at the macro call site when caller() is never invoked.
    return false;
  }
  const { paramNames, referencesVariable } = analyzeSignatureArgs(
    node.args,
    variableName,
    boundSymbols,
    suppliedParamNames,
  );
  if (referencesVariable) {
    return true;
  }

  const callerScope = addNamesToScope(boundSymbols, paramNames);
  return astChildReferencesVariable(node, 'body', variableName, callerScope);
}

function findCallBlockCaller(argsNode: unknown): NunjucksAstNode | undefined {
  if (!isNunjucksAstNode(argsNode) || !Array.isArray(argsNode.children)) {
    return undefined;
  }
  for (const child of argsNode.children) {
    if (
      !isNunjucksAstNode(child) ||
      child.typename !== 'KeywordArgs' ||
      !Array.isArray(child.children)
    ) {
      continue;
    }
    for (const pair of child.children) {
      if (
        isNunjucksAstNode(pair) &&
        pair.typename === 'Pair' &&
        getSymbolName(pair.key) === 'caller' &&
        isNunjucksAstNode(pair.value) &&
        pair.value.typename === 'Caller'
      ) {
        return pair.value;
      }
    }
  }
  return undefined;
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

function intersectSuppliedNames(
  current: ReadonlySet<string> | undefined,
  incoming: ReadonlySet<string>,
): Set<string> {
  if (current === undefined) {
    return new Set(incoming);
  }
  return new Set(Array.from(current).filter((name) => incoming.has(name)));
}

function collectCallerInvocations(node: unknown, memo?: MacroAnalysisMemo): NunjucksAstNode[] {
  const invocations: NunjucksAstNode[] = [];
  const pending = [node];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!isNunjucksAstNode(current)) {
      continue;
    }
    consumeAnalysisWork(memo);
    if (current.typename === 'FunCall' && getSymbolName(current.name) === 'caller') {
      invocations.push(current);
    }
    for (const field of current.fields ?? []) {
      const child = current[field];
      if (Array.isArray(child)) {
        for (const item of child) {
          pending.push(item);
        }
      } else {
        pending.push(child);
      }
    }
  }
  return invocations;
}

function collectSuppliedCallerParamNames(
  callerNode: NunjucksAstNode,
  macros: ReadonlySet<DeferredMacro> | undefined,
  boundSymbols: ReadonlySet<string>,
): ReadonlySet<string> | undefined {
  if (macros === undefined) {
    return undefined;
  }
  const memo = boundSymbols instanceof LinkedScope ? boundSymbols.macroAnalysisMemo() : undefined;
  const { paramNames } = analyzeSignatureArgs(callerNode.args, undefined, boundSymbols);
  const signature = { paramNames, paramNameSet: new Set(paramNames) };
  let shared: Set<string> | undefined;
  let foundCandidate = false;
  for (const macro of macros) {
    if (!macro.usesCaller) {
      continue;
    }
    foundCandidate = true;
    const invocations = collectCallerInvocations(macro.node.body, memo);
    if (invocations.length === 0) {
      return undefined;
    }
    let forMacro: Set<string> | undefined;
    for (const invocation of invocations) {
      const supplied = collectSuppliedMacroParamNames(invocation.args, signature, memo);
      forMacro = intersectSuppliedNames(forMacro, supplied);
    }
    shared = intersectSuppliedNames(shared, forMacro ?? new Set<string>());
  }
  return foundCandidate ? shared : undefined;
}

function macroCandidatesUseCaller(macros: ReadonlySet<DeferredMacro>): boolean {
  for (const macro of macros) {
    if (macro.usesCaller) {
      return true;
    }
  }
  return false;
}

function funCallNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  if (astChildReferencesVariable(node, 'args', variableName, boundSymbols)) {
    return true;
  }
  const deferredCaller =
    typeof variableName === 'object' && 'excludeOrOperands' in variableName
      ? findCallBlockCaller(node.args)
      : undefined;
  const macroName = getSymbolName(node.name);
  const macros =
    macroName && boundSymbols instanceof LinkedScope
      ? boundSymbols.findMacros(macroName)
      : undefined;
  const memo = boundSymbols instanceof LinkedScope ? boundSymbols.macroAnalysisMemo() : undefined;
  if (macros) {
    for (const macro of macros) {
      macro.called = true;
      const suppliedParamNames = collectSuppliedMacroParamNames(node.args, macro, memo);
      if (analyzeMacroBody(macro, variableName, memo, suppliedParamNames)) {
        return true;
      }
    }
  }
  if (!deferredCaller || (macros && !macroCandidatesUseCaller(macros))) {
    return false;
  }
  const suppliedCallerParams = deferredCaller
    ? collectSuppliedCallerParamNames(deferredCaller, macros, boundSymbols)
    : undefined;
  return callerNodeReferencesVariable(
    deferredCaller,
    variableName,
    boundSymbols,
    true,
    suppliedCallerParams,
  );
}

function postfixNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const postfix: NunjucksAstNode[] = [];
  let current: unknown = node;
  while (
    isNunjucksAstNode(current) &&
    (current.typename === 'FunCall' || current.typename === 'LookupVal')
  ) {
    postfix.push(current);
    current = current.typename === 'FunCall' ? current.name : current.target;
  }

  // Walk a mixed postfix spine from its base outwards. Each helper used to
  // handle only one node kind and recursively called the other on a mixed chain.
  const innermost = postfix[postfix.length - 1]!;
  if (
    isNunjucksAstNode(current) &&
    astReferencesVariable(
      current,
      variableName,
      {
        field: innermost.typename === 'FunCall' ? 'name' : 'target',
        node: innermost,
      },
      boundSymbols,
    )
  ) {
    return true;
  }
  for (let index = postfix.length - 1; index >= 0; index--) {
    const part = postfix[index]!;
    if (part.typename === 'LookupVal') {
      if (astChildReferencesVariable(part, 'val', variableName, boundSymbols)) {
        return true;
      }
      continue;
    }
    if (funCallNodeReferencesVariable(part, variableName, boundSymbols)) {
      return true;
    }
  }
  return false;
}

const POSTFIX_NODES = new Set(['FunCall', 'LookupVal']);

const LEFT_ASSOCIATIVE_BINARY_NODES = new Set([
  'Concat',
  'Add',
  'Sub',
  'Mul',
  'Div',
  'FloorDiv',
  'Mod',
  'And',
  'Or',
]);

function binaryNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  parent: NunjucksParentContext | undefined,
  boundSymbols: ReadonlySet<string>,
): boolean {
  let current = node;
  let currentParent = parent;
  // Nunjucks binary expressions are left-associative. Walk their deep left
  // spine iteratively instead of recursively overflowing on large values.
  while (LEFT_ASSOCIATIVE_BINARY_NODES.has(current.typename!)) {
    if (astChildReferencesVariable(current, 'right', variableName, boundSymbols)) {
      return true;
    }
    const left = current.left;
    if (!isNunjucksAstNode(left)) {
      return false;
    }
    currentParent = { field: 'left', node: current };
    current = left;
  }
  return astReferencesVariable(current, variableName, currentParent, boundSymbols);
}

function isStatementListNode(
  node: NunjucksAstNode,
): node is NunjucksAstNode & { children: unknown[] } {
  return (node.typename === 'Root' || node.typename === 'NodeList') && Array.isArray(node.children);
}

function conditionalMacroCandidates(
  name: string,
  bodySummary: ConditionalSummary,
  elseSummary: ConditionalSummary,
  boundSymbols: ReadonlySet<string>,
): ReadonlySet<DeferredMacro> | undefined {
  const assignedInBody = bodySummary.setBindings.has(name);
  const assignedInElse = elseSummary.setBindings.has(name);
  const declaredMacro =
    bodySummary.macroDeclarations.has(name) || elseSummary.macroDeclarations.has(name);
  if (
    (!assignedInBody && !assignedInElse) ||
    (!(assignedInBody && assignedInElse) && !boundSymbols.has(name) && !declaredMacro)
  ) {
    return undefined;
  }

  const candidates = new Set<DeferredMacro>([
    ...(bodySummary.macroCandidates.get(name) ?? []),
    ...(elseSummary.macroCandidates.get(name) ?? []),
  ]);
  if ((!assignedInBody || !assignedInElse) && boundSymbols instanceof LinkedScope) {
    for (const macro of boundSymbols.findMacros(name) ?? []) {
      candidates.add(macro);
    }
  }
  return candidates;
}

function ifNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
  summary?: ConditionalSummary,
): boolean {
  if (
    !isExistenceGuardedConditional(node, variableName) &&
    astChildReferencesVariable(node, 'cond', variableName, boundSymbols)
  ) {
    return true;
  }

  const bodySummary = createConditionalSummary();
  const elseSummary = createConditionalSummary();
  if (
    astChildReferencesVariable(
      node,
      'body',
      variableName,
      new LinkedScope(boundSymbols),
      bodySummary,
    )
  ) {
    return true;
  }
  if (
    astChildReferencesVariable(
      node,
      'else_',
      variableName,
      new LinkedScope(boundSymbols),
      elseSummary,
    )
  ) {
    return true;
  }

  const assignedNames = new Set([...bodySummary.setBindings, ...elseSummary.setBindings]);
  for (const name of assignedNames) {
    const candidates = conditionalMacroCandidates(name, bodySummary, elseSummary, boundSymbols);
    if (candidates === undefined) {
      continue;
    }
    summary?.setBindings.add(name);
    if (candidates.size > 0) {
      summary?.macroCandidates.set(name, candidates);
    }
    if (boundSymbols instanceof LinkedScope) {
      boundSymbols.removeMacro(name);
      if (candidates.size > 0) {
        boundSymbols.registerMacroCandidates(name, candidates);
      }
      boundSymbols.add(name);
    }
  }
  return false;
}

function isDefaultFilterWithUndefinedSafeInput(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
): boolean {
  return (
    node.typename === 'Filter' &&
    typeof variableName === 'object' &&
    'excludeOrOperands' in variableName &&
    ['default', 'd'].includes(getSymbolName(node.name) ?? '')
  );
}

function isDirectDefaultInput(node: unknown): node is NunjucksAstNode {
  if (!isNunjucksAstNode(node)) {
    return false;
  }
  return (
    node.typename === 'Symbol' ||
    (node.typename === 'LookupVal' && isDirectDefaultInput(node.target))
  );
}

function undefinedSafeOperandReferencesVariable(
  node: NunjucksAstNode,
  variableName: RequiredReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  if (node.typename === 'Symbol') {
    return false;
  }
  if (node.typename === 'LookupVal' && isDirectDefaultInput(node)) {
    // Every direct property/index read in this chain is undefined-safe. A
    // computed index or filter nested inside it still has to be analyzed.
    return (
      (isNunjucksAstNode(node.val) &&
        undefinedSafeOperandReferencesVariable(node.val, variableName, boundSymbols)) ||
      (isNunjucksAstNode(node.target) &&
        undefinedSafeOperandReferencesVariable(node.target, variableName, boundSymbols))
    );
  }
  return astReferencesVariable(node, variableName, undefined, boundSymbols);
}

function defaultFilterReferencesVariable(
  node: NunjucksAstNode,
  variableName: RequiredReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const args = node.args;
  if (!isNunjucksAstNode(args) || !Array.isArray(args.children)) {
    return false;
  }
  const [input, ...fallbacks] = args.children;
  if (
    isNunjucksAstNode(input) &&
    undefinedSafeOperandReferencesVariable(input, variableName, boundSymbols)
  ) {
    return true;
  }
  // default/d accepts an undefined direct input. Computations and filters that
  // produce the input still run first, and fallback arguments remain required.
  return fallbacks.some(
    (child) =>
      isNunjucksAstNode(child) &&
      astReferencesVariable(child, variableName, { field: 'children', node: args }, boundSymbols),
  );
}

function isExistenceGuardedConditional(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
): boolean {
  return (
    (node.typename === 'If' || node.typename === 'InlineIf') &&
    typeof variableName === 'object' &&
    'excludeOrOperands' in variableName &&
    isNunjucksAstNode(node.cond) &&
    node.cond.typename === 'Is' &&
    isNunjucksAstNode(node.cond.right) &&
    (node.cond.right.value === 'defined' || node.cond.right.value === 'undefined')
  );
}

function inlineIfNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  if (!isExistenceGuardedConditional(node, variableName)) {
    return astFieldsReferenceVariable(node, variableName, boundSymbols);
  }
  if (astChildReferencesVariable(node, 'cond', variableName, boundSymbols)) {
    return true;
  }
  const requiredTarget = variableName as RequiredReferenceTarget;
  return (
    (isNunjucksAstNode(node.body) &&
      undefinedSafeOperandReferencesVariable(node.body, requiredTarget, boundSymbols)) ||
    (isNunjucksAstNode(node.else_) &&
      undefinedSafeOperandReferencesVariable(node.else_, requiredTarget, boundSymbols))
  );
}

function orNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: RequiredReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  return (
    (isNunjucksAstNode(node.left) &&
      undefinedSafeOperandReferencesVariable(node.left, variableName, boundSymbols)) ||
    (isNunjucksAstNode(node.right) &&
      undefinedSafeOperandReferencesVariable(node.right, variableName, boundSymbols))
  );
}

function astReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  parent?: NunjucksParentContext,
  boundSymbols: ReadonlySet<string> = new Set(),
  summary?: ConditionalSummary,
): boolean {
  const memo = boundSymbols instanceof LinkedScope ? boundSymbols.macroAnalysisMemo() : undefined;
  consumeAnalysisWork(memo);
  if (
    node.typename === 'Or' &&
    typeof variableName === 'object' &&
    'excludeOrOperands' in variableName
  ) {
    return orNodeReferencesVariable(node, variableName as RequiredReferenceTarget, boundSymbols);
  }

  if (node.typename === 'If') {
    return ifNodeReferencesVariable(node, variableName, boundSymbols, summary);
  }

  if (node.typename === 'InlineIf') {
    return inlineIfNodeReferencesVariable(node, variableName, boundSymbols);
  }

  if (isDefaultFilterWithUndefinedSafeInput(node, variableName)) {
    return defaultFilterReferencesVariable(
      node,
      variableName as RequiredReferenceTarget,
      boundSymbols,
    );
  }

  if (POSTFIX_NODES.has(node.typename!)) {
    return postfixNodeReferencesVariable(node, variableName, boundSymbols);
  }

  if (LEFT_ASSOCIATIVE_BINARY_NODES.has(node.typename!)) {
    return binaryNodeReferencesVariable(node, variableName, parent, boundSymbols);
  }

  if (node.typename === 'Symbol' && typeof node.value === 'string') {
    const isReference = !boundSymbols.has(node.value) && !isNonReferenceSymbol(parent);
    if (typeof variableName === 'string') {
      if (node.value === variableName) {
        return isReference;
      }
    } else if (isReference) {
      if (variableName instanceof Set) {
        variableName.add(node.value);
      } else {
        variableName.references.add(node.value);
      }
    }
  }

  if (isStatementListNode(node)) {
    return astNodeListReferencesVariable(
      node.children,
      variableName,
      { field: 'children', node },
      boundSymbols,
      summary,
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

function boundedAstReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
): boolean | undefined {
  try {
    return astReferencesVariable(node, variableName);
  } catch (error) {
    if (error instanceof TemplateAnalysisLimitError) {
      return undefined;
    }
    throw error;
  }
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

function jsonTemplateStrings(template: string): string[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(template);
  } catch {
    return undefined;
  }

  const strings: string[] = [];
  const pending = [parsed];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === 'string') {
      strings.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        pending.push(item);
      }
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) {
        pending.push(item);
      }
    }
  }
  return strings;
}

/**
 * Detailed result for {@link analyzeTemplateReference}. `parsed` is `false`
 * when parsing or bounded scope analysis cannot complete. In that case,
 * `referenced` retains the textual substring safety envelope and callers must
 * not memoize the indeterminate result.
 */
export type TemplateReferenceResult = {
  referenced: boolean;
  parsed: boolean;
};

function analyzeTemplateString(template: string, variableName: string): TemplateReferenceResult {
  if (!template.includes(variableName)) {
    return { referenced: false, parsed: true };
  }
  const parseResult = parseNunjucksTemplate(template);
  if (!parseResult.ok) {
    return { referenced: true, parsed: false };
  }
  const referenced = boundedAstReferencesVariable(parseResult.ast, variableName);
  return {
    referenced: referenced ?? true,
    parsed: referenced !== undefined,
  };
}

/**
 * Classify whether a template references `variableName` as a real Nunjucks
 * expression symbol, and surface whether parsing and scope analysis completed.
 *
 * Callers that cache results should avoid caching when `parsed` is `false`,
 * so an indeterminate analysis cannot poison the cache for the process lifetime.
 */
export function analyzeTemplateReference(
  template: string,
  variableName: string,
): TemplateReferenceResult {
  if (!variableName || !template.includes(variableName)) {
    return { referenced: false, parsed: true };
  }

  // Structured prompts render each string independently. Do not let a set in
  // one JSON string hide a real reference in another string's scope. Each leaf
  // is then a single template, even if its text happens to look like JSON.
  const structuredStrings = getEnvBool('PROMPTFOO_DISABLE_JSON_AUTOESCAPE')
    ? undefined
    : jsonTemplateStrings(template);
  if (structuredStrings) {
    let referenced = false;
    let parsed = true;
    for (const value of structuredStrings) {
      const result = analyzeTemplateString(value, variableName);
      referenced ||= result.referenced;
      parsed &&= result.parsed;
    }
    return { referenced, parsed };
  }

  return analyzeTemplateString(template, variableName);
}

/**
 * Check whether a Nunjucks template references a variable as a real expression
 * symbol (not a string literal, comment, object key, filter/test name, property
 * access, macro/for/set binding, or `{% import %}` alias).
 *
 * If parsing fails or scope analysis exceeds its work limit, returns `true`
 * whenever the template textually contains `variableName`. This preserves the
 * safety envelope of the old substring-based
 * check so callers that gate serial-only behavior on this result do not
 * silently downgrade to parallel execution when a template is malformed.
 */
export function templateReferencesVariable(template: string, variableName: string): boolean {
  return analyzeTemplateReference(template, variableName).referenced;
}

type ExpressionWorkItem = { node: NunjucksAstNode; parent?: NunjucksParentContext };

function collectIsExpressionReferences(
  current: ExpressionWorkItem,
  pending: ExpressionWorkItem[],
): void {
  const right = current.node.right;
  if (isNunjucksAstNode(right)) {
    if (right.typename === 'FunCall') {
      if (isNunjucksAstNode(right.args)) {
        pending.push({ node: right.args, parent: { field: 'args', node: right } });
      }
    } else if (right.typename !== 'Symbol') {
      pending.push({ node: right, parent: { field: 'right', node: current.node } });
    }
  }
  if (isNunjucksAstNode(current.node.left)) {
    pending.push({ node: current.node.left, parent: { field: 'left', node: current.node } });
  }
}

function collectExpressionReferences(
  node: NunjucksAstNode,
  parent: NunjucksParentContext | undefined,
  references: Set<string>,
): void {
  const pending: ExpressionWorkItem[] = [{ node, parent }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.node.typename === 'Is') {
      collectIsExpressionReferences(current, pending);
      continue;
    }

    if (current.node.typename === 'Symbol' && typeof current.node.value === 'string') {
      if (!isNonReferenceSymbol(current.parent)) {
        references.add(current.node.value);
      }
      continue;
    }

    const fields = current.node.fields ?? [];
    for (let fieldIndex = fields.length - 1; fieldIndex >= 0; fieldIndex--) {
      const field = fields[fieldIndex]!;
      const child = current.node[field];
      if (Array.isArray(child)) {
        for (let index = child.length - 1; index >= 0; index--) {
          const item = child[index]!;
          if (isNunjucksAstNode(item)) {
            pending.push({ node: item, parent: { field, node: current.node } });
          }
        }
      } else if (isNunjucksAstNode(child)) {
        pending.push({ node: child, parent: { field, node: current.node } });
      }
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
  const pending = [node];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!isNunjucksAstNode(current)) {
      continue;
    }
    if (['Include', 'Import', 'FromImport', 'Extends'].includes(current.typename!)) {
      return true;
    }
    for (const field of current.fields ?? []) {
      const child = current[field];
      if (Array.isArray(child)) {
        for (const item of child) {
          pending.push(item);
        }
      } else {
        pending.push(child);
      }
    }
  }
  return false;
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
 * AST walk. Returns undefined when parsing or bounded analysis cannot complete,
 * so callers can retain their conservative textual fallback.
 */
export function extractUnboundVariablesFromTemplate(template: string): string[] | undefined {
  const parseResult = parseNunjucksTemplate(template);
  if (!parseResult.ok) {
    return undefined;
  }
  const references = new Set<string>();
  if (boundedAstReferencesVariable(parseResult.ast, references) === undefined) {
    return undefined;
  }
  return Array.from(references);
}

/**
 * Collect symbols that must be supplied for eager rendering. Nunjucks permits
 * missing operands in an `or` fallback, so those occurrences are excluded only
 * for this traversal; the same name elsewhere remains a required reference.
 * Returns undefined when parsing or bounded scope analysis cannot complete.
 */
export function extractRequiredVariablesFromTemplate(template: string): string[] | undefined {
  const parseResult = parseNunjucksTemplate(template);
  if (!parseResult.ok) {
    return undefined;
  }
  const target: RequiredReferenceTarget = {
    references: new Set<string>(),
    excludeOrOperands: true,
  };
  if (boundedAstReferencesVariable(parseResult.ast, target) === undefined) {
    return undefined;
  }
  return Array.from(target.references);
}
