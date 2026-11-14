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
  definitionScope: ReadonlySet<string>;
  called: boolean;
  analyzing: boolean;
};

type MacroAnalysisMemo = Map<DeferredMacro, Set<string>>;

class LinkedScope implements ReadonlySet<string> {
  private readonly names = new Set<string>();
  private readonly macros = new Map<string, DeferredMacro>();
  private fallbackMacroMemo?: MacroAnalysisMemo;

  constructor(
    private readonly parent?: ReadonlySet<string>,
    names: Iterable<string> = [],
  ) {
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

  registerMacro(name: string, definition: DeferredMacro): void {
    this.macros.set(name, definition);
  }

  removeMacroBindings(node: unknown): void {
    for (const name of collectBindingNames(node)) {
      this.macros.delete(name);
    }
  }

  rebindMacros(targets: unknown, value: unknown): void {
    const sourceName = getSymbolName(value);
    const sourceMacro = sourceName ? this.findMacro(sourceName) : undefined;
    this.removeMacroBindings(targets);
    if (sourceMacro) {
      for (const name of collectBindingNames(targets)) {
        this.registerMacro(name, sourceMacro);
      }
    }
  }

  removeMacro(name: string): void {
    this.macros.delete(name);
  }

  findMacro(name: string): DeferredMacro | undefined {
    if (this.names.has(name)) {
      return this.macros.get(name);
    }
    return this.parent instanceof LinkedScope ? this.parent.findMacro(name) : undefined;
  }

  localMacros(): DeferredMacro[] {
    return Array.from(this.macros.values());
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

function astNodeListReferencesVariable(
  nodes: readonly unknown[],
  variableName: ReferenceTarget,
  parent: NunjucksParentContext,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const scope = new LinkedScope(boundSymbols);
  const previousMemo = scope.macroAnalysisMemo();
  if (previousMemo === undefined) {
    scope.replaceMacroAnalysisMemo(new Map());
  }
  try {
    for (const item of nodes) {
      if (!isNunjucksAstNode(item)) {
        continue;
      }
      if (astReferencesVariable(item, variableName, parent, scope)) {
        return true;
      }
      if (item.typename === 'Set') {
        scope.rebindMacros(item.targets, item.value);
        addBindingNamesInPlace(scope, item.targets);
      } else if (item.typename === 'Macro') {
        addBindingNamesInPlace(scope, item.name);
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
    for (const macro of scope.localMacros()) {
      if (!macro.called && analyzeMacroBody(macro, variableName, scope.macroAnalysisMemo())) {
        return true;
      }
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
  paramNames: readonly string[],
): Set<string> {
  const supplied = new Set<string>();
  if (!isNunjucksAstNode(argsNode) || !Array.isArray(argsNode.children)) {
    return supplied;
  }

  let positionalIndex = 0;
  for (const child of argsNode.children) {
    if (!isNunjucksAstNode(child)) {
      continue;
    }
    if (child.typename === 'KeywordArgs' && Array.isArray(child.children)) {
      for (const pair of child.children) {
        const name =
          isNunjucksAstNode(pair) && pair.typename === 'Pair' ? getSymbolName(pair.key) : undefined;
        if (name && paramNames.includes(name)) {
          supplied.add(name);
        }
      }
      continue;
    }
    const name = paramNames[positionalIndex++];
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
  if (
    macro.analyzing ||
    memo?.get(macro)?.has(memoKey) ||
    macroAnalysisDepth >= MAX_MACRO_ANALYSIS_DEPTH
  ) {
    return false;
  }

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

    const macroScope = addNamesToScope(macro.definitionScope, macro.paramNames);
    const macroName = getSymbolName(macro.node.name);
    if (macroName) {
      macroScope.add(macroName);
      macroScope.registerMacro(macroName, macro);
    }
    macroScope.add('caller');
    const result = astChildReferencesVariable(macro.node, 'body', variableName, macroScope);
    if (!result && memo) {
      const memoKeys = memo.get(macro) ?? new Set<string>();
      memoKeys.add(memoKey);
      memo.set(macro, memoKeys);
    }
    return result;
  } finally {
    macroAnalysisDepth--;
    macro.analyzing = false;
  }
}

function macroNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  const { paramNames } = analyzeSignatureArgs(node.args, undefined, boundSymbols);
  const macroName = getSymbolName(node.name);
  if (macroName && boundSymbols instanceof LinkedScope) {
    boundSymbols.registerMacro(macroName, {
      node,
      paramNames,
      definitionScope: boundSymbols,
      called: false,
      analyzing: false,
    });
    return false;
  }

  return analyzeMacroBody(
    { node, paramNames, definitionScope: boundSymbols, called: false, analyzing: false },
    variableName,
  );
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
    if (astChildReferencesVariable(part, 'args', variableName, boundSymbols)) {
      return true;
    }
    const macroName = getSymbolName(part.name);
    const macro =
      macroName && boundSymbols instanceof LinkedScope
        ? boundSymbols.findMacro(macroName)
        : undefined;
    const memo = boundSymbols instanceof LinkedScope ? boundSymbols.macroAnalysisMemo() : undefined;
    if (macro && macroAnalysisDepth < MAX_MACRO_ANALYSIS_DEPTH) {
      // At the depth limit, leave the macro uncalled so the final-scope pass
      // collects its dependencies without recursively expanding the whole chain.
      macro.called = true;
      const suppliedParamNames = collectSuppliedMacroParamNames(part.args, macro.paramNames);
      if (analyzeMacroBody(macro, variableName, memo, suppliedParamNames)) {
        return true;
      }
    }
  }
  return false;
}

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

function guaranteedConditionalSetBindings(node: unknown): Set<string> {
  if (!isNunjucksAstNode(node)) {
    return new Set();
  }
  if (node.typename === 'If') {
    if (!isNunjucksAstNode(node.else_)) {
      return new Set();
    }
    const bodyBindings = guaranteedConditionalSetBindings(node.body);
    const elseBindings = guaranteedConditionalSetBindings(node.else_);
    return new Set(Array.from(bodyBindings).filter((name) => elseBindings.has(name)));
  }
  if (!isStatementListNode(node)) {
    return new Set();
  }

  const bindings = new Set<string>();
  for (const child of node.children) {
    if (!isNunjucksAstNode(child)) {
      continue;
    }
    if (child.typename === 'Set') {
      for (const name of collectBindingNames(child.targets)) {
        bindings.add(name);
      }
    } else if (child.typename === 'If') {
      for (const name of guaranteedConditionalSetBindings(child)) {
        bindings.add(name);
      }
    }
  }
  return bindings;
}

function ifNodeReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  boundSymbols: ReadonlySet<string>,
): boolean {
  if (
    !isExistenceGuardedConditional(node, variableName) &&
    astChildReferencesVariable(node, 'cond', variableName, boundSymbols)
  ) {
    return true;
  }
  if (astChildReferencesVariable(node, 'body', variableName, new LinkedScope(boundSymbols))) {
    return true;
  }
  if (astChildReferencesVariable(node, 'else_', variableName, new LinkedScope(boundSymbols))) {
    return true;
  }

  if (boundSymbols instanceof LinkedScope) {
    addNamesToScopeInPlace(boundSymbols, Array.from(guaranteedConditionalSetBindings(node)));
  }
  return false;
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

function astReferencesVariable(
  node: NunjucksAstNode,
  variableName: ReferenceTarget,
  parent?: NunjucksParentContext,
  boundSymbols: ReadonlySet<string> = new Set(),
): boolean {
  if (
    node.typename === 'Or' &&
    typeof variableName === 'object' &&
    'excludeOrOperands' in variableName
  ) {
    return false;
  }

  if (node.typename === 'If') {
    return ifNodeReferencesVariable(node, variableName, boundSymbols);
  }

  if (isExistenceGuardedConditional(node, variableName)) {
    return false;
  }

  if (node.typename === 'FunCall' || node.typename === 'LookupVal') {
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

/**
 * Collect symbols that must be supplied for eager rendering. Nunjucks permits
 * missing operands in an `or` fallback, so those occurrences are excluded only
 * for this traversal; the same name elsewhere remains a required reference.
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
  astReferencesVariable(parseResult.ast, target);
  return Array.from(target.references);
}
