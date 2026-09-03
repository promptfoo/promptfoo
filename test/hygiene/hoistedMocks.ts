import { visitorKeys } from 'oxc-parser';
import { createDiagnostic } from './engine';
import type { ArrowFunctionExpression, Node, Function as OxcFunction } from 'oxc-parser';

import type { HygieneDiagnostic, HygieneFile } from './engine';

type FunctionNode = ArrowFunctionExpression | OxcFunction;
type Value =
  | { kind: 'unknown' | 'missing' }
  | { kind: 'literal'; value: unknown }
  | { kind: 'mock'; key: string }
  | {
      kind: 'object';
      properties: Map<string, ValueSlot>;
      unknownProperties: boolean;
      array: boolean;
      elements?: ArrayElement[];
    }
  | { kind: 'function'; node: FunctionNode; scope: Scope; moduleVariable: boolean }
  | { kind: 'api'; name: string }
  | { kind: 'union'; values: Value[] };
type ValueSlot =
  | Value
  | { kind: 'choice'; condition: string; consequent: ValueSlot; alternate: ValueSlot };
type ArrayElement = { value: Value; optional?: boolean };
type Binding = { value: ValueSlot; directFunction: boolean };
type Scope = {
  id: number;
  bindings: Map<string, Binding>;
  parent?: Scope;
  varScope?: Scope;
};
type Suite = { parent?: Suite; hasChildren: boolean; empty: boolean };
type GuardPath = ReadonlyMap<string, boolean>;
type ControlPath = { kind: 'break' | 'continue'; label?: string; guards: GuardPath };
type Context = {
  scope: Scope;
  suite: Suite;
  allocationPath: string;
  phase: 'collection' | 'hoisted' | 'setup' | 'reset' | 'ownership';
  guards: ReadonlyMap<string, boolean>;
  hookGuards?: GuardPath;
  allocations: Set<string>;
  references?: Set<string>;
};
type ReturnFlow = {
  value: Value;
  fallsThrough: boolean;
  continuationGuards?: ReadonlyMap<string, boolean>;
  controls?: ControlPath[];
};
type CachedCall = {
  value: Value;
  guards: Map<string, boolean>;
  allocations: Set<string>;
};

const UNKNOWN: Value = { kind: 'unknown' };
const MISSING: Value = { kind: 'missing' };
export const persistentMockMethodNames = new Set([
  'mockImplementation',
  'mockReturnValue',
  'mockResolvedValue',
  'mockRejectedValue',
]);
const COLLECTION_APIS = new Set(['describe', 'suite']);
const TEST_APIS = new Set(['it', 'test']);
const HOOK_PHASES = new Map<string, 'setup' | 'reset'>([
  ['beforeAll', 'setup'],
  ['afterEach', 'setup'],
  ['beforeEach', 'reset'],
]);
const MAX_ANALYSIS_STEPS = 50_000;
const MAX_HELPER_DEPTH = 64;
const MAX_TRAVERSAL_DEPTH = 256;

class AnalysisLimitError extends Error {
  constructor(readonly node: Node) {
    super('hoisted mock reset analysis exceeded its budget; simplify the factory or helper graph');
  }
}

function children(node: Node): Node[] {
  const fields = node as unknown as Record<string, unknown>;
  return (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value = fields[key];
    return (Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []) as Node[];
  });
}

function isFunction(node: Node): node is FunctionNode {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

function unwrap(node: Node): Node {
  while (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'ParenthesizedExpression' ||
    node.type === 'ChainExpression'
  ) {
    node = node.expression;
  }
  return node;
}

function propertyName(node: Node, computed: boolean): string | undefined {
  if (!computed && node.type === 'Identifier') {
    return node.name;
  }
  if (
    node.type === 'Literal' &&
    (typeof node.value === 'string' || typeof node.value === 'number')
  ) {
    return String(node.value);
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? undefined;
  }
  return undefined;
}

function members(value: Value): Value[] {
  return value.kind === 'union' ? value.values : [value];
}

// A file-local provenance analysis, not a JavaScript runtime: follow known
// synchronous helpers and literal containers, but never execute imports,
// methods or generators. Deferred implementations are inspected only for
// captured mocks, without executing their effects. Each invocation owns its
// mock identities; forwarding an existing value never allocates another mock.
export function findHoistedPersistentMockWithoutReset(
  file: HygieneFile,
): HygieneDiagnostic | undefined {
  let nextScope = 0;
  const mocks = new Map<string, Value>();
  const setters = new Map<string, Node>();
  const resets = new Set<string>();
  const resetCoverage = new Map<string, Map<Suite, ValueSlot>>();
  const mockSuites = new Map<string, Suite>();
  const suites = new Set<Suite>();
  const suitesWithTests = new Set<Suite>();
  const rootSuite = suite();
  let targetSuites: Suite[] = [];
  const hoistedMocks = new Set<string>();
  const exposedMocks = new Set<string>();
  const implementationMocks = new Map<string, Set<string>>();
  const reusedMocks = new Set<string>();
  const setupCallbacks: {
    callback: Value;
    context: Context;
    call: Node;
    api: string;
  }[] = [];
  const controlLabels = new Map<Node, Set<string>>();
  const birthGuards = new Map<string, Map<string, boolean>[]>();
  const callCache = new Map<string, CachedCall>();
  const activeFunctions = new Set<FunctionNode>();
  const valueIds = new Map<Value, number>();
  const literals = new Map<unknown, Value>();
  let remainingSteps = MAX_ANALYSIS_STEPS;
  let traversalDepth = 0;

  function checkSyntaxDepth() {
    // This preflight is linear in source size, including deferred bodies that
    // the other hygiene policies visit. Do not put their nodes on the JS stack.
    const pending = [{ node: file.sourceFile as Node, depth: 0 }];
    for (let next = pending.pop(); next; next = pending.pop()) {
      if (next.depth > MAX_TRAVERSAL_DEPTH) {
        throw new AnalysisLimitError(next.node);
      }
      for (const child of children(next.node)) {
        pending.push({ node: child, depth: next.depth + 1 });
      }
    }
  }

  function withinTraversal<T>(node: Node, visit: () => T): T {
    if (traversalDepth >= MAX_TRAVERSAL_DEPTH) {
      throw new AnalysisLimitError(node);
    }
    traversalDepth += 1;
    try {
      return visit();
    } finally {
      traversalDepth -= 1;
    }
  }

  // Memoization cannot coalesce fresh argument objects or every allocation
  // path. Bound all phases and graph walks, including cache hits, and fail
  // closed rather than treating an incomplete analysis as a successful reset.
  function spendStep(node: Node = file.sourceFile) {
    if (--remainingSteps < 0) {
      throw new AnalysisLimitError(node);
    }
  }

  function copyGuards(guards: ReadonlyMap<string, boolean>): Map<string, boolean> {
    const copy = new Map<string, boolean>();
    for (const [condition, outcome] of guards) {
      spendStep();
      copy.set(condition, outcome);
    }
    return copy;
  }

  function suite(parent?: Suite, empty = false): Suite {
    const result = { parent, hasChildren: false, empty };
    if (parent) {
      parent.hasChildren = true;
    }
    suites.add(result);
    return result;
  }

  function withinSuite(target: Suite, owner: Suite): boolean {
    for (let current: Suite | undefined = target; current; current = current.parent) {
      spendStep();
      if (current === owner) {
        return true;
      }
    }
    return false;
  }

  function recordReset(keys: Iterable<string>, context: Context) {
    for (const key of keys) {
      const coverage = resetCoverage.get(key) ?? new Map<Suite, ValueSlot>();
      for (const target of targetSuites) {
        if (withinSuite(target, context.suite)) {
          coverage.set(target, writeSlot(coverage.get(target) ?? MISSING, literal(true), context));
        }
      }
      resetCoverage.set(key, coverage);
    }
  }

  function union(values: Value[]): Value {
    const unique = new Set<Value>();
    for (const value of values) {
      for (const part of members(value)) {
        spendStep();
        unique.add(part);
      }
    }
    const parts = [...unique];
    return parts.length === 1 ? parts[0] : { kind: 'union', values: parts };
  }

  function resolveSlot(slot: ValueSlot, guards: ReadonlyMap<string, boolean> = new Map()): Value {
    const pending = [slot];
    const seen = new Set<ValueSlot>();
    const values: Value[] = [];
    for (let next = pending.pop(); next; next = pending.pop()) {
      spendStep();
      if (seen.has(next)) {
        continue;
      }
      seen.add(next);
      if (next.kind !== 'choice') {
        values.push(next);
        continue;
      }
      const outcome = guards.get(next.condition);
      if (outcome !== false) {
        pending.push(next.consequent);
      }
      if (outcome !== true) {
        pending.push(next.alternate);
      }
    }
    return union(values);
  }

  function choice(condition: string, consequent: ValueSlot, alternate: ValueSlot): ValueSlot {
    return consequent === alternate
      ? consequent
      : { kind: 'choice', condition, consequent, alternate };
  }

  function writeSlot(previous: ValueSlot, value: Value, context: Context): ValueSlot {
    // Retain the old value on paths where a write does not happen. Conditions
    // stay ordered, so an else write replaces only its own branch, not the
    // preceding if branch or a shared object's other possible identities.
    const guards = [...context.guards].sort(([left], [right]) =>
      left === right ? 0 : left < right ? -1 : 1,
    );
    function replace(slot: ValueSlot, index: number, depth: number): ValueSlot {
      spendStep();
      if (index === guards.length) {
        return value;
      }
      if (depth >= MAX_HELPER_DEPTH) {
        throw new AnalysisLimitError(file.sourceFile);
      }
      const [condition, outcome] = guards[index];
      if (slot.kind === 'choice' && slot.condition < condition) {
        return choice(
          slot.condition,
          replace(slot.consequent, index, depth + 1),
          replace(slot.alternate, index, depth + 1),
        );
      }
      const consequent =
        slot.kind === 'choice' && slot.condition === condition ? slot.consequent : slot;
      const alternate =
        slot.kind === 'choice' && slot.condition === condition ? slot.alternate : slot;
      return choice(
        condition,
        outcome ? replace(consequent, index + 1, depth + 1) : consequent,
        outcome ? alternate : replace(alternate, index + 1, depth + 1),
      );
    }
    return replace(previous, 0, 0);
  }

  function diagnostic(node: Node, ruleId: string, message: string): HygieneDiagnostic {
    return createDiagnostic(file, {
      ruleId,
      start: node.start,
      message,
      snippet: file.source.slice(node.start, node.end),
    });
  }

  function scope(parent?: Scope, functionScope = false): Scope {
    const result: Scope = { id: nextScope++, bindings: new Map(), parent };
    result.varScope = functionScope || !parent ? result : parent.varScope;
    return result;
  }

  function literal(value: unknown): Value {
    let result = literals.get(value);
    if (!result) {
      result = { kind: 'literal', value };
      literals.set(value, result);
    }
    return result;
  }

  function lookup(name: string, current: Scope, hoisted = false): Binding | undefined {
    for (let owner: Scope | undefined = current; owner; owner = owner.parent) {
      const binding = owner.bindings.get(name);
      if (binding) {
        // Local aliases are initialized by the factory. Module aliases are
        // unavailable when Vitest moves vi.hoisted ahead of their declarations.
        return !hoisted || owner.parent || binding.directFunction ? binding : undefined;
      }
    }
    return undefined;
  }

  function declare(pattern: Node, target: Scope) {
    spendStep(pattern);
    if (pattern.type === 'Identifier') {
      if (!target.bindings.has(pattern.name)) {
        target.bindings.set(pattern.name, { value: UNKNOWN, directFunction: false });
      }
    } else if (pattern.type === 'AssignmentPattern') {
      declare(pattern.left, target);
    } else if (pattern.type === 'RestElement') {
      declare(pattern.argument, target);
    } else if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties) {
        declare(property.type === 'RestElement' ? property.argument : property.value, target);
      }
    } else if (pattern.type === 'ArrayPattern') {
      for (const element of pattern.elements) {
        if (element) {
          declare(element, target);
        }
      }
    }
  }

  function collectVars(node: Node, target: Scope) {
    const pending = [node];
    for (let next = pending.pop(); next; next = pending.pop()) {
      spendStep(next);
      if (isFunction(next) || next.type === 'StaticBlock') {
        continue;
      }
      if (next.type === 'VariableDeclaration' && next.kind === 'var') {
        for (const declaration of next.declarations) {
          declare(declaration.id, target);
        }
      }
      for (const child of children(next)) {
        pending.push(child);
      }
    }
  }

  function functionValue(node: FunctionNode, owner: Scope, moduleVariable = false): Value {
    return { kind: 'function', node, scope: owner, moduleVariable };
  }

  function prepareImport(node: Extract<Node, { type: 'ImportDeclaration' }>, owner: Scope) {
    for (const specifier of node.specifiers) {
      let value = UNKNOWN;
      if (node.source.value === 'vitest') {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          value = { kind: 'api', name: 'vitest' };
        } else if (specifier.type === 'ImportSpecifier') {
          value = { kind: 'api', name: propertyName(specifier.imported, false) ?? '' };
        }
      }
      owner.bindings.set(specifier.local.name, { value, directFunction: false });
    }
  }

  function prepare(statements: Node[], owner: Scope) {
    for (const statement of statements) {
      spendStep(statement);
      const node =
        statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
          ? (statement.declaration ?? statement)
          : statement;
      switch (node.type) {
        case 'VariableDeclaration':
          for (const declaration of node.declarations) {
            declare(declaration.id, node.kind === 'var' ? owner.varScope! : owner);
          }
          break;
        case 'FunctionDeclaration':
          if (node.id) {
            owner.bindings.set(node.id.name, {
              value: functionValue(node, owner),
              directFunction: true,
            });
          }
          break;
        case 'ClassDeclaration':
          if (node.id) {
            declare(node.id, owner);
          }
          break;
        case 'ImportDeclaration':
          prepareImport(node, owner);
          break;
      }
    }
  }

  function get(value: Value, key: string | undefined, context: Context): Value {
    if (key === undefined) {
      return UNKNOWN;
    }
    return union(
      members(value).map((part) => {
        if (part.kind === 'object') {
          return resolveSlot(
            part.properties.get(key) ?? (part.unknownProperties ? UNKNOWN : MISSING),
            context.guards,
          );
        }
        if (part.kind === 'api') {
          return { kind: 'api', name: part.name === 'vitest' ? key : `${part.name}.${key}` };
        }
        return UNKNOWN;
      }),
    );
  }

  function bind(
    pattern: Node,
    value: Value,
    context: Context,
    target = context.scope,
    directFunction = false,
  ) {
    spendStep(pattern);
    if (pattern.type === 'Identifier') {
      const previous = target.bindings.get(pattern.name)?.value ?? UNKNOWN;
      const next = writeSlot(previous, value, context);
      if (next !== previous) {
        callCache.clear();
      }
      target.bindings.set(pattern.name, { value: next, directFunction });
    } else if (pattern.type === 'AssignmentPattern') {
      const effective = members(value).map((part) =>
        part.kind === 'missing'
          ? evaluate(pattern.right, context)
          : part.kind === 'unknown'
            ? union([part, evaluate(pattern.right, guarded(context, pattern, true))])
            : part,
      );
      bind(pattern.left, union(effective), context, target, directFunction);
    } else if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties) {
        if (property.type === 'RestElement') {
          bind(property.argument, UNKNOWN, context, target);
        } else {
          if (property.computed) {
            evaluate(property.key, context);
          }
          bind(
            property.value,
            get(value, propertyName(property.key, property.computed), context),
            context,
            target,
          );
        }
      }
    } else if (pattern.type === 'ArrayPattern') {
      for (const [index, element] of pattern.elements.entries()) {
        if (element) {
          bind(element, get(value, String(index), context), context, target);
        }
      }
    } else if (pattern.type === 'RestElement') {
      bind(pattern.argument, value, context, target);
    }
  }

  function valueId(value: Value): number {
    let id = valueIds.get(value);
    if (id === undefined) {
      id = valueIds.size;
      valueIds.set(value, id);
    }
    return id;
  }

  function reuseCall(cached: CachedCall, context: Context): Value {
    // A cached tail result may also be created in another branch. Remove
    // caller conditions that no longer hold for every creation of that mock.
    for (const [condition, outcome] of cached.guards) {
      spendStep();
      if (context.guards.get(condition) !== outcome) {
        cached.guards.delete(condition);
        for (const allocation of cached.allocations) {
          spendStep();
          for (const path of birthGuards.get(allocation) ?? []) {
            spendStep();
            path.delete(condition);
          }
        }
      }
    }
    for (const allocation of cached.allocations) {
      spendStep();
      context.allocations.add(allocation);
    }
    return cached.value;
  }

  function functionResult(node: FunctionNode, context: Context): Value {
    if (!node.body) {
      return MISSING;
    }
    if (node.body.type !== 'BlockStatement') {
      return evaluate(node.body, context, true);
    }
    const flow = executeStatements(node.body.body, context);
    return flow ? (flow.fallsThrough ? union([flow.value, MISSING]) : flow.value) : MISSING;
  }

  function invoke(
    value: Value,
    args: Value[],
    context: Context,
    call: Node,
    {
      tail = false,
      root = false,
      unknownArity = false,
      spreads,
    }: {
      tail?: boolean;
      root?: boolean;
      unknownArity?: boolean;
      spreads?: ReadonlySet<number>;
    } = {},
  ): Value {
    spendStep(call);
    if (
      value.kind !== 'function' ||
      (value.node.generator && context.phase !== 'ownership') ||
      (context.phase === 'hoisted' && value.moduleVariable && !root) ||
      activeFunctions.has(value.node)
    ) {
      return UNKNOWN;
    }
    // Tail calls forward the caller's result slot. Reusing that slot for
    // mutually exclusive branches keeps helper DAGs linear, while sibling
    // calls constructing object properties retain distinct allocation paths.
    const allocationPath = tail
      ? context.allocationPath
      : `${context.allocationPath}/${call.start}`;
    const key = `${context.phase}:${allocationPath}:${value.node.start}:${value.scope.id}:${unknownArity}:${[...(spreads ?? [])].join(',')}:${args.map(valueId).join(',')}`;
    const cached = context.phase === 'ownership' ? undefined : callCache.get(key);
    if (cached) {
      return reuseCall(cached, context);
    }
    if (activeFunctions.size >= MAX_HELPER_DEPTH) {
      throw new AnalysisLimitError(call);
    }
    const owner = scope(value.scope, true);
    const nested = { ...context, scope: owner, allocationPath, allocations: new Set<string>() };
    for (const parameter of value.node.params) {
      declare(parameter, owner);
    }
    if (value.node.body) {
      collectVars(value.node.body, owner);
    }
    activeFunctions.add(value.node);
    let result: Value;
    try {
      bindParameters(value.node, args, nested, unknownArity, spreads);
      result = functionResult(value.node, nested);
      if (context.phase !== 'ownership') {
        callCache.set(key, {
          value: result,
          guards: copyGuards(context.guards),
          allocations: nested.allocations,
        });
      }
      for (const allocation of nested.allocations) {
        spendStep(call);
        context.allocations.add(allocation);
      }
    } finally {
      activeFunctions.delete(value.node);
    }
    return result;
  }

  function bindParameters(
    node: FunctionNode,
    args: Value[],
    context: Context,
    unknownArity: boolean,
    spreads?: ReadonlySet<number>,
  ) {
    const firstSpread = spreads?.values().next().value ?? 0;
    for (const [index, parameter] of node.params.entries()) {
      const value: Value =
        parameter.type === 'RestElement'
          ? restArray(args, index, unknownArity, spreads)
          : unknownArity && index >= firstSpread
            ? UNKNOWN
            : (args[index] ?? MISSING);
      bind(parameter, value, context);
    }
  }

  function restArray(
    args: Value[],
    start: number,
    unknownArity: boolean,
    spreads?: ReadonlySet<number>,
  ): Value {
    if (unknownArity && !spreads?.size) {
      return arrayValue([{ value: UNKNOWN, optional: true }]);
    }
    const elements: ArrayElement[] = [];
    let minimumIndex = 0;
    let uncertainPosition = false;
    for (const [index, value] of args.entries()) {
      spendStep();
      if (spreads?.has(index)) {
        uncertainPosition = true;
        elements.push({ value, optional: true });
      } else {
        // A known argument belongs to the rest array once even its earliest
        // possible position is beyond the fixed parameters.
        if (minimumIndex >= start || uncertainPosition) {
          elements.push({ value, optional: minimumIndex < start });
        }
        minimumIndex += 1;
      }
    }
    return arrayValue(elements);
  }

  function markReset(value: Value, context: Context) {
    const parts = members(value);
    if (parts.some((part) => part.kind !== 'mock')) {
      return;
    }
    const keys = [...mockKeys(value)];
    // Resetting a conditional alias cannot reset two mocks that coexist.
    // Multiple possible identities are safe only when their creation branches
    // are mutually exclusive, as with a conditional factory return value.
    for (const [index, left] of keys.entries()) {
      for (const right of keys.slice(index + 1)) {
        spendStep();
        if (canCoexist(left, right)) {
          return;
        }
      }
    }
    recordReset(keys, context);
  }

  function canCoexist(left: string, right: string): boolean {
    for (const leftPath of birthGuards.get(left)!) {
      for (const rightPath of birthGuards.get(right)!) {
        spendStep();
        const exclusive = [...leftPath].some(([condition, outcome]) => {
          spendStep();
          return rightPath.has(condition) && rightPath.get(condition) !== outcome;
        });
        if (!exclusive) {
          return true;
        }
      }
    }
    return false;
  }

  function* reachableValues(...values: Value[]): Generator<Value> {
    const seen = new Set<Value>();
    const pending = values;
    for (let next = pending.pop(); next; next = pending.pop()) {
      spendStep();
      if (seen.has(next)) {
        continue;
      }
      seen.add(next);
      const children =
        next.kind === 'object'
          ? (next.elements?.map((element) => element.value) ?? next.properties.values())
          : next.kind === 'union'
            ? next.values
            : [];
      // Queue children before yielding: callers may invalidate array contents.
      for (const child of children) {
        spendStep();
        pending.push(resolveSlot(child));
      }
      yield next;
    }
  }

  function mockKeys(
    value: Value,
    unknownExposure?: ReadonlySet<string>,
    captureContext?: Context,
  ): Set<string> {
    const keys = new Set<string>();
    for (const next of reachableValues(value)) {
      if (
        next.kind === 'unknown' ||
        next.kind === 'function' ||
        (next.kind === 'object' && next.unknownProperties)
      ) {
        // An opaque value could expose any mock created by this factory.
        for (const key of unknownExposure ?? []) {
          spendStep();
          keys.add(key);
        }
      }
      if (next.kind === 'mock') {
        keys.add(next.key);
      }
      if (next.kind === 'function' && captureContext) {
        for (const key of callbackReferences(next, captureContext, next.node)) {
          spendStep();
          keys.add(key);
        }
      }
    }
    return keys;
  }

  function makeMock(node: Node, context: Context): Value {
    const key = `${context.allocationPath}:${node.start}`;
    let mock = mocks.get(key);
    if (!mock) {
      mock = { kind: 'mock', key };
      mocks.set(key, mock);
      mockSuites.set(key, context.suite);
      birthGuards.set(key, []);
    }
    birthGuards.get(key)!.push(copyGuards(context.guards));
    context.allocations.add(key);
    if (context.phase === 'hoisted') {
      hoistedMocks.add(key);
    }
    return mock;
  }

  function callApi(api: string, args: Value[], context: Context, node: Node): Value {
    switch (api) {
      case 'vi.fn':
        // mockReset restores a vi.fn(callback)'s original implementation. Its
        // captures remain reachable, unlike a later mockImplementation setter.
        for (const key of callbackReferences(args[0] ?? UNKNOWN, context, node)) {
          exposedMocks.add(key);
        }
        return makeMock(node, context);
      case 'vi.mocked':
        return args[0] ?? UNKNOWN;
      case 'vi.hoisted': {
        const allocations = new Set<string>();
        const value = invoke(
          args[0] ?? UNKNOWN,
          [],
          { ...context, phase: 'hoisted', allocations },
          node,
          { root: true },
        );
        for (const key of allocations) {
          spendStep(node);
          context.allocations.add(key);
        }
        for (const key of mockKeys(value, allocations)) {
          exposedMocks.add(key);
        }
        return value;
      }
      case 'vi.resetAllMocks':
        if (context.phase === 'reset') {
          // A conditional setter later in this hook may introduce an obligation.
          recordReset(mocks.keys(), context);
        }
        break;
    }
    return callTestApi(api, args, context, node);
  }

  function callTestApi(api: string, args: Value[], context: Context, node: Node): Value {
    const base = api.split('.')[0];
    const curried = api.endsWith('.each') || api.endsWith('.for');
    if (context.phase !== 'collection') {
      return { kind: 'api', name: curried ? base : api };
    }
    if (COLLECTION_APIS.has(base) && !curried) {
      const callback = args.at(-1);
      if (callback?.kind === 'function') {
        const empty = isEmptySuite(callback.node.body);
        invoke(
          callback,
          [{ kind: 'api', name: 'test' }],
          { ...context, suite: suite(context.suite, empty) },
          node,
          {
            root: true,
          },
        );
      }
    } else if (HOOK_PHASES.has(base)) {
      const callback = args[0];
      if (callback?.kind === 'function') {
        setupCallbacks.push({ callback, context, call: node, api: base });
      }
    } else if (TEST_APIS.has(base) && !curried && !api.endsWith('.todo') && args.length >= 2) {
      suitesWithTests.add(context.suite);
    }
    return { kind: 'api', name: curried ? base : api };
  }

  function isEmptySuite(node: Node | null | undefined): boolean {
    if (!node) {
      return true;
    }
    spendStep(node);
    if (isFunction(node)) {
      return true;
    }
    switch (node.type) {
      case 'Identifier':
      case 'Literal':
      case 'EmptyStatement':
        return true;
      case 'BlockStatement':
        return node.body.every(isEmptySuite);
      case 'ExpressionStatement':
        return isEmptySuite(node.expression);
      case 'ReturnStatement':
        return isEmptySuite(node.argument);
      case 'VariableDeclaration':
        return node.declarations.every(
          (declaration) => declaration.id.type === 'Identifier' && isEmptySuite(declaration.init),
        );
      case 'UnaryExpression':
        return node.operator === 'void' && isEmptySuite(node.argument);
      default:
        return false;
    }
  }

  function callbackReferences(value: Value, context: Context, node: Node): Set<string> {
    const references = new Set<string>();
    if (value.kind === 'function') {
      invoke(
        value,
        value.node.params.map(() => UNKNOWN),
        { ...context, phase: 'ownership', references },
        node,
        { root: true, unknownArity: true },
      );
    }
    return references;
  }

  function captureReferences(value: Value, context: Context, node: Node): Value {
    if (context.references) {
      spendStep(node);
      for (const key of mockKeys(value, undefined, context)) {
        context.references.add(key);
      }
    }
    return value;
  }

  function recordImplementation(
    receiver: Value,
    nestedMocks: ReadonlySet<string>,
    context: Context,
  ) {
    if (context.phase === 'reset') {
      for (const key of nestedMocks) {
        if (hoistedMocks.has(key)) {
          reusedMocks.add(key);
        }
      }
      return;
    }
    for (const part of members(receiver)) {
      if (part.kind === 'mock') {
        // Replaced literal return values are discarded too. Keep their mock
        // identities so an outer reset covers every unexposed implementation.
        const implementations = implementationMocks.get(part.key) ?? new Set<string>();
        for (const key of nestedMocks) {
          spendStep();
          implementations.add(key);
        }
        implementationMocks.set(part.key, implementations);
      }
    }
  }

  function callMockMethod(
    receiver: Value,
    method: string,
    args: Value[],
    node: Node,
    context: Context,
  ): Value {
    if (method === 'mockReset' && context.phase === 'reset') {
      markReset(receiver, context);
    }
    if (
      method === 'mockResolvedValue' ||
      method === 'mockReturnValue' ||
      method === 'mockRejectedValue'
    ) {
      recordImplementation(receiver, mockKeys(args[0] ?? UNKNOWN, undefined, context), context);
    } else if (method === 'mockImplementation') {
      recordImplementation(
        receiver,
        callbackReferences(args[0] ?? UNKNOWN, context, node),
        context,
      );
    }
    if (persistentMockMethodNames.has(method)) {
      recordPersistentSetter(receiver, node, context);
    }
    return method.startsWith('mock') ? receiver : UNKNOWN;
  }

  function recordPersistentSetter(receiver: Value, node: Node, context: Context) {
    if (context.phase === 'reset' && !hasConditionalSetup(context)) {
      return;
    }
    for (let part of members(receiver)) {
      if (part.kind !== 'mock' && context.phase === 'hoisted') {
        part = makeMock(node, context);
      }
      if (part.kind === 'mock' && (context.phase === 'hoisted' || hoistedMocks.has(part.key))) {
        setters.set(part.key, setters.get(part.key) ?? node);
      }
    }
  }

  function hasConditionalSetup(context: Context): boolean {
    for (const [condition, outcome] of context.guards) {
      spendStep();
      if (context.hookGuards?.get(condition) !== outcome) {
        return true;
      }
    }
    return false;
  }

  function callExpression(
    node: Extract<Node, { type: 'CallExpression' }>,
    context: Context,
    tail: boolean,
  ): Value {
    const callee = unwrap(node.callee);
    // Evaluate receiver and argument effects before considering the outer reset.
    const receiver =
      callee.type === 'MemberExpression' ? evaluate(callee.object, context) : undefined;
    if (callee.type === 'MemberExpression' && callee.computed) {
      evaluate(callee.property, context);
    }
    const method =
      callee.type === 'MemberExpression'
        ? propertyName(callee.property, callee.computed)
        : undefined;
    let callable = receiver ? get(receiver, method, context) : evaluate(callee, context);
    if (
      context.phase === 'hoisted' &&
      callee.type === 'Identifier' &&
      callable.kind === 'function' &&
      !lookup(callee.name, context.scope, true)
    ) {
      callable = UNKNOWN;
    }
    const { args, spreads } = callArguments(node, context);
    if (callable.kind === 'api') {
      return callApi(callable.name, args, context, node);
    }
    if (context.phase === 'collection' && args.some((argument) => argument.kind === 'function')) {
      // Opaque collection helpers can register tests, including callbacks
      // passed to forEach. Their owning suite still needs reset coverage.
      suitesWithTests.add(context.suite);
    }
    if (receiver && method) {
      forgetArrays(receiver);
      if (!members(receiver).every((part) => part.kind === 'mock')) {
        forgetArrays(...args);
        exposeArguments([receiver, ...args], context);
      }
      return callMockMethod(receiver, method, args, node, context);
    }
    if (callable.kind !== 'function') {
      forgetArrays(...args);
      exposeArguments(args, context);
    }
    return invoke(callable, args, context, node, {
      tail,
      unknownArity: spreads.size > 0,
      spreads,
    });
  }

  function callArguments(
    node: Extract<Node, { type: 'CallExpression' }>,
    context: Context,
  ): { args: Value[]; spreads: Set<number> } {
    const args: Value[] = [];
    const spreads = new Set<number>();
    for (const element of evaluateElements(node.arguments, context)) {
      spendStep(node);
      if (element.optional) {
        spreads.add(args.length);
      }
      args.push(element.value);
    }
    return { args, spreads };
  }

  function exposeArguments(values: Value[], context: Context) {
    for (const value of values) {
      for (const key of mockKeys(value, undefined, context)) {
        spendStep();
        exposedMocks.add(key);
      }
    }
  }

  function forgetArrays(...values: Value[]) {
    // An unmodeled method or opaque callee can mutate its array arguments.
    // They are no longer statically known reset targets after that call.
    for (const next of reachableValues(...values)) {
      if (next.kind === 'object' && next.array) {
        callCache.clear();
        next.properties.clear();
        next.unknownProperties = true;
        if (next.elements) {
          next.elements.length = 0;
          next.elements = undefined;
        }
      }
    }
  }

  function evaluateObject(
    node: Extract<Node, { type: 'ObjectExpression' }>,
    context: Context,
  ): Value {
    const properties = new Map<string, ValueSlot>();
    let unknownProperties = false;
    for (const property of node.properties) {
      if (property.type === 'SpreadElement') {
        const spread = evaluate(property.argument, context);
        if (spread.kind !== 'object' || spread.unknownProperties) {
          properties.clear();
          unknownProperties = true;
        }
        if (spread.kind === 'object') {
          for (const [key, value] of spread.properties) {
            spendStep(property);
            properties.set(key, value);
          }
        }
        continue;
      }
      if (property.computed) {
        evaluate(property.key, context);
      }
      const key = propertyName(property.key, property.computed);
      const value =
        property.method || property.kind !== 'init' ? UNKNOWN : evaluate(property.value, context);
      if (key === undefined) {
        unknownProperties = true;
        properties.clear();
      } else {
        properties.set(key, value);
      }
    }
    return { kind: 'object', properties, unknownProperties, array: false };
  }

  function evaluateElements(nodes: readonly (Node | null)[], context: Context): ArrayElement[] {
    const elements: ArrayElement[] = [];
    for (const element of nodes) {
      if (element?.type === 'SpreadElement') {
        const spread = evaluate(element.argument, context);
        if (spread.kind === 'object' && spread.array && spread.elements) {
          for (const value of spread.elements) {
            spendStep(element);
            elements.push(value);
          }
        } else {
          elements.push({ value: UNKNOWN, optional: true });
        }
      } else {
        elements.push({ value: element ? evaluate(element, context) : MISSING });
      }
    }
    return elements;
  }

  function arrayValue(elements: ArrayElement[]): Extract<Value, { kind: 'object' }> {
    const properties = new Map<string, ValueSlot>();
    let unknownProperties = false;
    for (const [index, element] of elements.entries()) {
      spendStep();
      unknownProperties ||= element.optional === true;
      if (!unknownProperties) {
        properties.set(String(index), element.value);
      }
    }
    return { kind: 'object', properties, unknownProperties, array: true, elements };
  }

  function evaluateIdentifier(
    node: Extract<Node, { type: 'Identifier' }>,
    context: Context,
  ): Value {
    const binding = lookup(node.name, context.scope);
    if (binding) {
      return captureReferences(resolveSlot(binding.value, context.guards), context, node);
    }
    if (node.name === 'undefined') {
      return MISSING;
    }
    return node.name === 'vi' ||
      HOOK_PHASES.has(node.name) ||
      COLLECTION_APIS.has(node.name) ||
      TEST_APIS.has(node.name)
      ? { kind: 'api', name: node.name }
      : UNKNOWN;
  }

  function evaluateConditional(
    node: Extract<Node, { type: 'ConditionalExpression' }>,
    context: Context,
    tail: boolean,
  ): Value {
    const test = evaluate(node.test, context);
    if (test.kind === 'literal') {
      return evaluate(test.value ? node.consequent : node.alternate, context, tail);
    }
    return union([
      evaluate(node.consequent, guarded(context, node, true), tail),
      evaluate(node.alternate, guarded(context, node, false), tail),
    ]);
  }

  function logicalRightContext(
    operator: string,
    left: Value,
    node: Node,
    context: Context,
  ): Context | undefined {
    const outcomes = new Set(
      members(left).map((part) => {
        spendStep(node);
        if (part.kind === 'unknown') {
          return undefined;
        }
        if (operator.startsWith('??')) {
          return part.kind === 'missing' || (part.kind === 'literal' && part.value == null);
        }
        const truthy = part.kind === 'literal' ? Boolean(part.value) : part.kind !== 'missing';
        return operator.startsWith('&&') ? truthy : !truthy;
      }),
    );
    const outcome = outcomes.size === 1 ? [...outcomes][0] : undefined;
    return outcome === undefined ? guarded(context, node, true) : outcome ? context : undefined;
  }

  function evaluateLogical(
    node: Extract<Node, { type: 'LogicalExpression' }>,
    context: Context,
    tail: boolean,
  ): Value {
    const left = evaluate(node.left, context);
    const rightContext = logicalRightContext(node.operator, left, node, context);
    if (!rightContext) {
      return left;
    }
    const right = evaluate(node.right, rightContext, tail);
    return rightContext === context ? right : union([left, right]);
  }

  function writeProperty(receiver: Value, key: string | undefined, value: Value, context: Context) {
    const alternatives = members(receiver);
    for (const part of alternatives) {
      if (part.kind !== 'object') {
        // Opaque receivers, including globals and function properties, can
        // retain the assigned mocks after their outer implementation resets.
        for (const key of mockKeys(value, context.allocations, context)) {
          exposedMocks.add(key);
        }
        continue;
      }
      if (part.array) {
        // Index/length writes can introduce holes or truncate the iterable.
        forgetArrays(part);
      }
      if (key === undefined) {
        for (const [name, previous] of part.properties) {
          part.properties.set(name, writeSlot(previous, UNKNOWN, context));
        }
        part.unknownProperties = true;
      } else {
        const previous = part.properties.get(key) ?? (part.unknownProperties ? UNKNOWN : MISSING);
        part.properties.set(
          key,
          writeSlot(
            previous,
            alternatives.length === 1
              ? value
              : union([resolveSlot(previous, context.guards), value]),
            context,
          ),
        );
      }
    }
  }

  function evaluateAssignment(
    node: Extract<Node, { type: 'AssignmentExpression' }>,
    context: Context,
  ): Value {
    const left = unwrap(node.left);
    const receiver = left.type === 'MemberExpression' ? evaluate(left.object, context) : UNKNOWN;
    if (left.type === 'MemberExpression' && left.computed) {
      evaluate(left.property, context);
    }
    const key =
      left.type === 'MemberExpression' ? propertyName(left.property, left.computed) : undefined;
    const binding = left.type === 'Identifier' ? lookup(left.name, context.scope) : undefined;
    const previous = binding
      ? resolveSlot(binding.value, context.guards)
      : get(receiver, key, context);
    const effect = assignmentEffect(node, previous, context);
    if (!effect) {
      return previous;
    }
    const { value, writeContext } = effect;
    // Mutating a captured value also invalidates helper results that read it.
    callCache.clear();
    if (binding) {
      binding.value = writeSlot(binding.value, value, writeContext);
      binding.directFunction = false;
    } else if (left.type === 'MemberExpression') {
      writeProperty(receiver, key, value, writeContext);
    }
    return writeContext === context ? value : union([previous, value]);
  }

  function assignmentEffect(
    node: Extract<Node, { type: 'AssignmentExpression' }>,
    previous: Value,
    context: Context,
  ): { value: Value; writeContext: Context } | undefined {
    const logical = node.operator === '&&=' || node.operator === '||=' || node.operator === '??=';
    const writeContext = logical
      ? logicalRightContext(node.operator, previous, node, context)
      : context;
    if (!writeContext) {
      return undefined;
    }
    const right = evaluate(node.right, writeContext);
    return { value: node.operator === '=' || logical ? right : UNKNOWN, writeContext };
  }

  function evaluateMutation(target: Node, context: Context): Value {
    target = unwrap(target);
    callCache.clear();
    if (target.type === 'Identifier') {
      const binding = lookup(target.name, context.scope);
      if (binding) {
        binding.value = writeSlot(binding.value, UNKNOWN, context);
        binding.directFunction = false;
      }
    } else if (target.type === 'MemberExpression') {
      const receiver = evaluate(target.object, context);
      if (target.computed) {
        evaluate(target.property, context);
      }
      writeProperty(receiver, propertyName(target.property, target.computed), UNKNOWN, context);
    } else {
      evaluate(target, context);
    }
    return UNKNOWN;
  }

  function evaluate(input: Node, context: Context, tail = false): Value {
    return withinTraversal(input, () => {
      spendStep(input);
      const node = unwrap(input);
      if (
        context.phase === 'ownership' &&
        (node.type === 'CallExpression' ||
          node.type === 'NewExpression' ||
          node.type === 'AssignmentExpression' ||
          node.type === 'UpdateExpression' ||
          (node.type === 'UnaryExpression' && node.operator === 'delete') ||
          node.type === 'TaggedTemplateExpression')
      ) {
        // Reading a callback's captures must not run setters, register hooks,
        // allocate mocks, invoke helpers, or mutate its enclosing bindings.
        return evaluateChildren(node, context);
      }
      return evaluateNode(node, context, tail);
    });
  }

  function evaluateChildren(node: Node, context: Context): Value {
    for (const child of children(node)) {
      if (context.phase === 'ownership' || !isFunction(child)) {
        evaluate(child, context);
      }
    }
    return UNKNOWN;
  }

  function evaluateNode(node: Node, context: Context, tail: boolean): Value {
    switch (node.type) {
      case 'Identifier':
        return evaluateIdentifier(node, context);
      case 'Literal':
        return literal(node.value);
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
      case 'FunctionDeclaration':
        return captureReferences(functionValue(node, context.scope), context, node);
      case 'CallExpression':
        return callExpression(node, context, tail);
      case 'MemberExpression': {
        const object = evaluate(node.object, context);
        if (node.computed) {
          evaluate(node.property, context);
        }
        return get(object, propertyName(node.property, node.computed), context);
      }
      case 'ObjectExpression':
        return evaluateObject(node, context);
      case 'ArrayExpression':
        return arrayValue(evaluateElements(node.elements, context));
      case 'ConditionalExpression':
        return evaluateConditional(node, context, tail);
      case 'LogicalExpression':
        return evaluateLogical(node, context, tail);
      case 'BinaryExpression':
        return evaluateBinary(node, context);
      case 'SequenceExpression':
        return node.expressions.reduce<Value>(
          (_, expression, index) =>
            evaluate(expression, context, tail && index === node.expressions.length - 1),
          MISSING,
        );
      case 'UnaryExpression': {
        if (node.operator === 'delete') {
          return evaluateMutation(node.argument, context);
        }
        const value = evaluate(node.argument, context);
        if (node.operator === 'void') {
          return MISSING;
        }
        return node.operator === '!' && value.kind === 'literal' ? literal(!value.value) : UNKNOWN;
      }
      case 'AssignmentExpression':
        return evaluateAssignment(node, context);
      case 'UpdateExpression':
        return evaluateMutation(node.argument, context);
      case 'ClassExpression':
        executeClass(node, context);
        return UNKNOWN;
      case 'TaggedTemplateExpression': {
        const tag = evaluate(node.tag, context);
        for (const expression of node.quasi.expressions) {
          evaluate(expression, context);
        }
        return tag.kind === 'api' ? { kind: 'api', name: tag.name.split('.')[0] } : UNKNOWN;
      }
      default:
        return evaluateChildren(node, context);
    }
  }

  function evaluateBinary(
    node: Extract<Node, { type: 'BinaryExpression' }>,
    context: Context,
  ): Value {
    const left = evaluate(node.left, context);
    const right = evaluate(node.right, context);
    if (
      left.kind !== 'literal' ||
      right.kind !== 'literal' ||
      typeof left.value !== 'number' ||
      typeof right.value !== 'number'
    ) {
      return UNKNOWN;
    }
    // Resolve simple counted-loop entry tests without attempting general JS coercion.
    switch (node.operator) {
      case '<':
        return literal(left.value < right.value);
      case '<=':
        return literal(left.value <= right.value);
      case '>':
        return literal(left.value > right.value);
      case '>=':
        return literal(left.value >= right.value);
      case '===':
        return literal(left.value === right.value);
      case '!==':
        return literal(left.value !== right.value);
      default:
        return UNKNOWN;
    }
  }

  function executeClass(
    node: Extract<Node, { type: 'ClassDeclaration' | 'ClassExpression' }>,
    context: Context,
  ) {
    for (const decorator of node.decorators) {
      evaluate(decorator.expression, context);
    }
    if (node.superClass) {
      evaluate(node.superClass, context);
    }
    for (const member of node.body.body) {
      if (member.type === 'StaticBlock') {
        const owner = scope(context.scope, true);
        for (const statement of member.body) {
          collectVars(statement, owner);
        }
        executeStatements(member.body, { ...context, scope: owner });
        continue;
      }
      if (member.type === 'TSIndexSignature') {
        continue;
      }
      for (const decorator of member.decorators) {
        evaluate(decorator.expression, context);
      }
      if (member.computed) {
        evaluate(member.key, context);
      }
      if (
        (member.type === 'PropertyDefinition' || member.type === 'AccessorProperty') &&
        member.static &&
        member.value
      ) {
        evaluate(member.value, context);
      }
    }
  }

  function executeVariables(
    node: Extract<Node, { type: 'VariableDeclaration' }>,
    context: Context,
  ) {
    for (const declaration of node.declarations) {
      if (!declaration.init) {
        continue; // A repeated declaration-only var does not overwrite its binding.
      }
      const target = node.kind === 'var' ? context.scope.varScope! : context.scope;
      const initializer = unwrap(declaration.init);
      const value = isFunction(initializer)
        ? functionValue(initializer, context.scope, !context.scope.parent)
        : evaluate(initializer, context);
      bind(declaration.id, value, context, target, isFunction(initializer));
    }
  }

  function executeIf(
    node: Extract<Node, { type: 'IfStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    const test = evaluate(node.test, context);
    if (test.kind === 'literal') {
      const branch = test.value ? node.consequent : node.alternate;
      return branch ? execute(branch, context) : undefined;
    }
    const leftContext = guarded(context, node, true);
    const rightContext = guarded(context, node, false);
    const left = execute(node.consequent, leftContext);
    const right = node.alternate ? execute(node.alternate, rightContext) : undefined;
    if (!left && !right) {
      return undefined;
    }
    const continuations = [...normalPaths(left, leftContext), ...normalPaths(right, rightContext)];
    return {
      value: union([...(left ? [left.value] : []), ...(right ? [right.value] : [])]),
      fallsThrough: continuations.length > 0,
      continuationGuards: mergeContinuations(continuations, context, node),
      controls: collectControls([left, right]),
    };
  }

  function executeSwitch(
    node: Extract<Node, { type: 'SwitchStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    const discriminant = evaluate(node.discriminant, context);
    const nested = { ...context, scope: scope(context.scope) };
    prepare(
      node.cases.flatMap((clause) => clause.consequent),
      nested.scope,
    );
    const { selections, noMatch } = switchSelections(node, discriminant, nested);
    const flows = selections.map(({ index, context: selected }) =>
      executeSwitchPath(node, index, selected),
    );
    const continuations = flows.flatMap((flow) =>
      flow.fallsThrough ? [flow.continuationGuards ?? context.guards] : [],
    );
    if (noMatch) {
      continuations.push(noMatch.guards);
    }
    return {
      value: union(flows.map((flow) => flow.value)),
      fallsThrough: continuations.length > 0,
      continuationGuards: mergeContinuations(continuations, context, node),
      controls: collectControls(flows),
    };
  }

  function mergeContinuations(
    paths: ReadonlyMap<string, boolean>[],
    context: Context,
    node: Node,
  ): ReadonlyMap<string, boolean> {
    if (!paths.length) {
      return context.guards;
    }
    const common = copyGuards(paths[0]);
    let coverage: ValueSlot = MISSING;
    for (const guards of paths) {
      coverage = writeSlot(coverage, literal(true), { ...context, guards });
      for (const [condition, outcome] of common) {
        spendStep(node);
        if (guards.get(condition) !== outcome) {
          common.delete(condition);
        }
      }
    }
    const complete = resolveSlot(coverage, common);
    // A disjunction that cannot be represented by shared guards is still a
    // conditional continuation, not proof that every execution reaches here.
    return complete.kind === 'literal' && complete.value === true
      ? common
      : guarded({ ...context, guards: common }, node, true).guards;
  }

  function normalPaths(flow: ReturnFlow | undefined, context: Context): GuardPath[] {
    return !flow || flow.fallsThrough ? [flow?.continuationGuards ?? context.guards] : [];
  }

  function collectControls(flows: (ReturnFlow | undefined)[]): ControlPath[] {
    const controls: ControlPath[] = [];
    for (const flow of flows) {
      for (const control of flow?.controls ?? []) {
        spendStep();
        controls.push(control);
      }
    }
    return controls;
  }

  function targetsControl(control: ControlPath, node: Node): boolean {
    return !control.label || controlLabels.get(node)?.has(control.label) === true;
  }

  function iterationPaths(flow: ReturnFlow | undefined, context: Context, node: Node): GuardPath[] {
    return [
      ...normalPaths(flow, context),
      ...collectControls([flow])
        .filter((control) => control.kind === 'continue' && targetsControl(control, node))
        .map((control) => control.guards),
    ];
  }

  function constrainGuards(guards: GuardPath, extra?: GuardPath): GuardPath {
    const result = copyGuards(guards);
    for (const [condition, outcome] of extra ?? []) {
      spendStep();
      result.set(condition, outcome);
    }
    return result;
  }

  function switchSelections(
    node: Extract<Node, { type: 'SwitchStatement' }>,
    discriminant: Value,
    context: Context,
  ) {
    const selections: { index: number; context: Context }[] = [];
    let remaining: Context | undefined = context;
    const defaultIndex = node.cases.findIndex((clause) => !clause.test);
    for (const [index, clause] of node.cases.entries()) {
      if (!remaining) {
        break;
      }
      if (!clause.test) {
        continue;
      }
      const test = evaluate(clause.test, remaining);
      if (discriminant.kind === 'literal' && test.kind === 'literal') {
        if (discriminant.value === test.value) {
          selections.push({ index, context: remaining });
          remaining = undefined;
        }
      } else {
        selections.push({ index, context: guarded(remaining, clause, true) });
        remaining = guarded(remaining, clause, false);
      }
    }
    if (remaining && defaultIndex !== -1) {
      selections.push({ index: defaultIndex, context: remaining });
      remaining = undefined;
    }
    return { selections, noMatch: remaining };
  }

  function executeSwitchPath(
    node: Extract<Node, { type: 'SwitchStatement' }>,
    start: number,
    context: Context,
  ): ReturnFlow {
    const returns: Value[] = [];
    const exits: GuardPath[] = [];
    const controls: ControlPath[] = [];
    let fallsThrough = true;
    for (const clause of node.cases.slice(start)) {
      const result = executeStatements(clause.consequent, context);
      if (!result) {
        continue;
      }
      returns.push(result.value);
      for (const control of collectControls([result])) {
        if (control.kind === 'break' && targetsControl(control, node)) {
          exits.push(control.guards);
        } else {
          controls.push(control);
        }
      }
      if (!result.fallsThrough) {
        fallsThrough = false;
        break;
      }
      if (result.continuationGuards) {
        context = { ...context, guards: result.continuationGuards };
      }
    }
    if (fallsThrough) {
      exits.push(context.guards);
    }
    return {
      value: union(returns),
      fallsThrough: exits.length > 0,
      continuationGuards: mergeContinuations(exits, context, node),
      controls,
    };
  }

  function executeFor(
    node: Extract<Node, { type: 'ForStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    const nested = { ...context, scope: scope(context.scope) };
    if (node.init?.type === 'VariableDeclaration') {
      prepare([node.init], nested.scope);
      executeVariables(node.init, nested);
    } else if (node.init) {
      evaluate(node.init, nested);
    }
    const test = node.test ? evaluate(node.test, nested) : literal(true);
    if (test.kind === 'literal' && !test.value) {
      return undefined;
    }
    const bodyContext = test.kind === 'literal' ? nested : guarded(nested, node, true);
    const result = execute(node.body, bodyContext);
    const updates = iterationPaths(result, bodyContext, node);
    if (node.update && updates.length) {
      evaluate(node.update, {
        ...bodyContext,
        guards: mergeContinuations(updates, bodyContext, node.update),
      });
    }
    return finishLoop(result, node, nested, bodyContext, test.kind === 'literal');
  }

  function executeForEach(
    node: Extract<Node, { type: 'ForInStatement' | 'ForOfStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    const iterable = evaluate(node.right, context);
    if (
      node.type === 'ForOfStatement' &&
      iterable.kind === 'object' &&
      iterable.array &&
      iterable.elements
    ) {
      return executeArrayLoop(node, iterable.elements, context);
    }
    const nested = loopBinding(node, UNKNOWN, guarded(context, node, true));
    const result = execute(node.body, nested);
    return finishLoop(result, node, context, nested, false);
  }

  function executeArrayLoop(
    node: Extract<Node, { type: 'ForOfStatement' }>,
    elements: ArrayElement[],
    context: Context,
  ): ReturnFlow | undefined {
    const returns: Value[] = [];
    const exits: GuardPath[] = [];
    const controls: ControlPath[] = [];
    let reachesEnd = true;
    for (const [index, element] of elements.entries()) {
      const iteration = {
        ...context,
        allocationPath: `${context.allocationPath}/for:${node.start}:${index}`,
      };
      const nested = loopBinding(
        node,
        element.value,
        element.optional ? guarded(iteration, node, true) : iteration,
      );
      const result = execute(node.body, nested);
      if (!result) {
        continue;
      }
      returns.push(result.value);
      for (const control of collectControls([result])) {
        if (!targetsControl(control, node)) {
          controls.push(control);
        } else if (control.kind === 'break') {
          exits.push(control.guards);
        }
      }
      const next = iterationPaths(result, nested, node);
      if (element.optional) {
        next.push(guarded(iteration, node, false).guards);
      }
      if (!next.length) {
        reachesEnd = false;
        break;
      }
      context = { ...context, guards: mergeContinuations(next, nested, node) };
    }
    if (reachesEnd) {
      exits.push(context.guards);
    }
    return returns.length
      ? {
          value: union(returns),
          fallsThrough: exits.length > 0,
          continuationGuards: mergeContinuations(exits, context, node),
          controls,
        }
      : undefined;
  }

  function loopBinding(
    node: Extract<Node, { type: 'ForInStatement' | 'ForOfStatement' }>,
    value: Value,
    context: Context,
  ): Context {
    const nested = { ...context, scope: scope(context.scope) };
    if (node.left.type === 'VariableDeclaration') {
      const target = node.left.kind === 'var' ? nested.scope.varScope! : nested.scope;
      for (const declaration of node.left.declarations) {
        declare(declaration.id, target);
        bind(declaration.id, value, nested, target);
      }
    }
    return nested;
  }

  function executeWhile(
    node: Extract<Node, { type: 'WhileStatement' | 'DoWhileStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    let bodyContext = context;
    let guaranteedIteration = true;
    if (node.type === 'WhileStatement') {
      const test = evaluate(node.test, context);
      if (test.kind === 'literal' && !test.value) {
        return undefined;
      }
      if (test.kind !== 'literal') {
        guaranteedIteration = false;
        bodyContext = guarded(context, node, true);
      }
    }
    const result = execute(node.body, bodyContext);
    if (node.type === 'DoWhileStatement') {
      const conditions = iterationPaths(result, bodyContext, node);
      if (conditions.length) {
        evaluate(node.test, {
          ...bodyContext,
          guards: mergeContinuations(conditions, bodyContext, node.test),
        });
      }
    }
    return finishLoop(result, node, context, bodyContext, guaranteedIteration);
  }

  function finishLoop(
    result: ReturnFlow | undefined,
    node: Node,
    context: Context,
    bodyContext: Context,
    guaranteedIteration: boolean,
  ): ReturnFlow | undefined {
    if (!result) {
      return undefined;
    }
    const controls = collectControls([result]);
    const exits = [
      ...normalPaths(result, bodyContext),
      ...controls
        .filter((control) => targetsControl(control, node))
        .map((control) => control.guards),
    ];
    if (!guaranteedIteration) {
      exits.push(guarded(context, node, false).guards);
    }
    return {
      value: result.value,
      fallsThrough: exits.length > 0,
      continuationGuards: mergeContinuations(exits, context, node),
      controls: controls.filter((control) => !targetsControl(control, node)),
    };
  }

  function executeLabeled(
    node: Extract<Node, { type: 'LabeledStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    const labels = new Set<string>();
    let body: Node = node;
    while (body.type === 'LabeledStatement') {
      spendStep(body);
      labels.add(body.label.name);
      body = body.body;
    }
    controlLabels.set(body, labels);
    const result = execute(body, context);
    if (!result) {
      return undefined;
    }
    const controls = collectControls([result]);
    const exits = new Set(
      controls.filter(
        (control) => control.kind === 'break' && control.label && labels.has(control.label),
      ),
    );
    const paths = [...normalPaths(result, context), ...[...exits].map((control) => control.guards)];
    return {
      ...result,
      fallsThrough: paths.length > 0,
      continuationGuards: mergeContinuations(paths, context, node),
      controls: controls.filter((control) => !exits.has(control)),
    };
  }

  function executeTry(
    node: Extract<Node, { type: 'TryStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    const attemptedContext = node.handler ? guarded(context, node, true) : context;
    const attempted = execute(node.block, attemptedContext);
    const paths = [{ flow: attempted, context: attemptedContext }];
    if (node.handler) {
      const recoveredContext = guarded(context, node, false);
      paths.push({ flow: execute(node.handler, recoveredContext), context: recoveredContext });
    }
    const final = node.finalizer ? execute(node.finalizer, context) : undefined;
    if (final && !final.fallsThrough) {
      return final;
    }
    const flows = paths.map(({ flow }) => flow);
    if (!final && flows.every((flow) => !flow)) {
      return undefined;
    }
    const continuations = paths.flatMap(({ flow, context: nested }) =>
      !flow || flow.fallsThrough ? [flow?.continuationGuards ?? nested.guards] : [],
    );
    const continuationGuards = constrainGuards(
      mergeContinuations(continuations, context, node),
      final?.continuationGuards,
    );
    return {
      value: union([
        ...flows.flatMap((flow) => (flow ? [flow.value] : [])),
        ...(final ? [final.value] : []),
      ]),
      fallsThrough: continuations.length > 0,
      continuationGuards,
      controls: [
        ...collectControls(flows).map((control) => ({
          ...control,
          guards: constrainGuards(control.guards, final?.continuationGuards),
        })),
        ...collectControls([final]),
      ],
    };
  }

  function execute(node: Node, context: Context): ReturnFlow | undefined {
    return withinTraversal(node, () => executeNode(node, context));
  }

  function executeNode(node: Node, context: Context): ReturnFlow | undefined {
    spendStep(node);
    switch (node.type) {
      case 'ExpressionStatement':
        evaluate(node.expression, context);
        break;
      case 'ReturnStatement':
        return {
          value: node.argument ? evaluate(node.argument, context, true) : MISSING,
          fallsThrough: false,
        };
      case 'ThrowStatement':
        evaluate(node.argument, context);
        return { value: union([]), fallsThrough: false };
      case 'BreakStatement':
        return {
          value: union([]),
          fallsThrough: false,
          controls: [{ kind: 'break', label: node.label?.name, guards: context.guards }],
        };
      case 'ContinueStatement':
        return {
          value: union([]),
          fallsThrough: false,
          controls: [{ kind: 'continue', label: node.label?.name, guards: context.guards }],
        };
      case 'VariableDeclaration':
        executeVariables(node, context);
        break;
      case 'BlockStatement':
        return executeStatements(node.body, { ...context, scope: scope(context.scope) });
      case 'IfStatement':
        return executeIf(node, context);
      case 'SwitchStatement':
        return executeSwitch(node, context);
      case 'ForStatement':
        return executeFor(node, context);
      case 'ForInStatement':
      case 'ForOfStatement':
        return executeForEach(node, context);
      case 'WhileStatement':
      case 'DoWhileStatement':
        return executeWhile(node, context);
      case 'TryStatement':
        return executeTry(node, context);
      case 'LabeledStatement':
        return executeLabeled(node, context);
      case 'CatchClause': {
        const nested = { ...context, scope: scope(context.scope) };
        if (node.param) {
          declare(node.param, nested.scope);
          bind(node.param, UNKNOWN, nested);
        }
        return execute(node.body, nested);
      }
      case 'ClassDeclaration':
        executeClass(node, context);
        break;
      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        if (node.declaration) {
          return execute(node.declaration, context);
        }
        break;
      case 'FunctionDeclaration':
      case 'ImportDeclaration':
        break;
      default:
        for (const child of children(node)) {
          if (!isFunction(child)) {
            execute(child, context);
          }
        }
    }
    return undefined;
  }

  function executeStatements(statements: Node[], context: Context): ReturnFlow | undefined {
    prepare(statements, context.scope);
    const returns: Value[] = [];
    const controls: ControlPath[] = [];
    for (const statement of statements) {
      const returned = execute(statement, context);
      if (returned !== undefined) {
        returns.push(returned.value);
        controls.push(...collectControls([returned]));
        if (!returned.fallsThrough) {
          return { ...returned, value: union(returns), controls };
        }
        if (returned.continuationGuards) {
          context = { ...context, guards: returned.continuationGuards };
        }
      }
    }
    return returns.length
      ? { value: union(returns), fallsThrough: true, continuationGuards: context.guards, controls }
      : undefined;
  }

  function guarded(context: Context, condition: Node, outcome: boolean): Context {
    const key = `${context.allocationPath}:${condition.start}`;
    const guards = copyGuards(context.guards);
    guards.set(key, outcome);
    return { ...context, guards };
  }

  function hookArguments(api: string): Value[] {
    // Vitest supplies [suite] to beforeAll and [test.context, suite] to per-test hooks.
    return Array.from(
      { length: api === 'beforeAll' ? 1 : 2 },
      (): Value => ({
        kind: 'object',
        properties: new Map(),
        unknownProperties: true,
        array: false,
      }),
    );
  }

  try {
    checkSyntaxDepth();
    const moduleScope = scope();
    collectVars(file.sourceFile, moduleScope);
    executeStatements(file.sourceFile.body, {
      scope: moduleScope,
      suite: rootSuite,
      allocationPath: 'module',
      phase: 'collection',
      guards: new Map(),
      allocations: new Set(),
    });
    targetSuites = [...suites].filter(
      (owner) => suitesWithTests.has(owner) || (!owner.hasChildren && !owner.empty),
    );
    for (const phase of ['setup', 'reset'] as const) {
      for (const hook of setupCallbacks) {
        if (HOOK_PHASES.get(hook.api) === phase) {
          invoke(
            hook.callback,
            hookArguments(hook.api),
            { ...hook.context, phase, hookGuards: hook.context.guards },
            hook.call,
            { root: true },
          );
        }
      }
    }
    for (const key of setters.keys()) {
      const relevantSuites = targetSuites.filter((target) =>
        withinSuite(target, mockSuites.get(key) ?? rootSuite),
      );
      if (
        relevantSuites.every((target) => {
          const reset = resolveSlot(resetCoverage.get(key)?.get(target) ?? MISSING);
          return reset.kind === 'literal' && reset.value === true;
        })
      ) {
        resets.add(key);
      }
    }
    // Resetting an implementation discards mocks reachable only through that
    // implementation's values or captures. A separately exposed or reinstalled
    // mock still needs its own reset.
    for (const key of resets) {
      for (const nested of implementationMocks.get(key) ?? []) {
        spendStep();
        if (!exposedMocks.has(nested) && !reusedMocks.has(nested)) {
          resets.add(nested);
        }
      }
    }
    let finding: Node | undefined;
    for (const [key, node] of setters) {
      if (!resets.has(key) && (!finding || node.start < finding.start)) {
        finding = node;
      }
    }
    return finding
      ? diagnostic(
          finding,
          'hoisted-persistent-mock-reset',
          'hoisted mocks with persistent implementations must reset implementations with mockReset() or vi.resetAllMocks()',
        )
      : undefined;
  } catch (error) {
    if (error instanceof AnalysisLimitError) {
      return diagnostic(error.node, 'hoisted-mock-analysis-limit', error.message);
    }
    throw error;
  }
}
