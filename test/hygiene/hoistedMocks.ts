import { visitorKeys } from 'oxc-parser';
import { createDiagnostic } from './engine';
import type { ArrowFunctionExpression, Node, Function as OxcFunction } from 'oxc-parser';

import type { HygieneDiagnostic, HygieneFile } from './engine';

type FunctionNode = ArrowFunctionExpression | OxcFunction;
type Value =
  | { kind: 'unknown' | 'missing' }
  | { kind: 'literal'; value: unknown }
  | { kind: 'mock'; key: string }
  | { kind: 'object'; properties: Map<string, ValueSlot>; unknownProperties: boolean }
  | { kind: 'function'; node: FunctionNode; scope: Scope; moduleVariable: boolean }
  | { kind: 'api'; name: string }
  | { kind: 'union'; values: Value[] };
type ValueSlot =
  | Value
  | { kind: 'choice'; condition: string; consequent: ValueSlot; alternate: ValueSlot };
type Binding = { value: ValueSlot; directFunction: boolean };
type Scope = {
  id: number;
  bindings: Map<string, Binding>;
  parent?: Scope;
  varScope?: Scope;
};
type Context = {
  scope: Scope;
  allocationPath: string;
  phase: 'collection' | 'hoisted' | 'reset';
  guards: ReadonlyMap<string, boolean>;
  allocations: Set<string>;
};
type ReturnFlow = {
  value: Value;
  fallsThrough: boolean;
  continuationGuards?: ReadonlyMap<string, boolean>;
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
const RESET_APIS = new Set(['beforeEach', 'afterEach']);
const MAX_ANALYSIS_STEPS = 50_000;
const MAX_HELPER_DEPTH = 64;

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

// A file-local provenance analysis, not a JavaScript runtime: follow direct
// synchronous helpers and literal containers, but never execute imports,
// methods, generators, or deferred callbacks. Each invocation owns its mock
// identities; forwarding an existing value never allocates another mock.
export function findHoistedPersistentMockWithoutReset(
  file: HygieneFile,
): HygieneDiagnostic | undefined {
  let nextScope = 0;
  const mocks = new Map<string, Value>();
  const setters = new Map<string, Node>();
  const resets = new Set<string>();
  const resetCoverage = new Map<string, ValueSlot>();
  const hoistedMocks = new Set<string>();
  const exposedMocks = new Set<string>();
  const implementationMocks = new Map<string, Set<string>>();
  const reusedMocks = new Set<string>();
  const resetCallbacks: { callback: Value; context: Context; call: Node }[] = [];
  const birthGuards = new Map<string, Map<string, boolean>>();
  const callCache = new Map<string, CachedCall>();
  const activeFunctions = new Set<FunctionNode>();
  const valueIds = new Map<Value, number>();
  const literals = new Map<unknown, Value>();
  let globalResetCoverage: ValueSlot = MISSING;
  let remainingSteps = MAX_ANALYSIS_STEPS;

  // Memoization cannot coalesce fresh argument objects or every allocation
  // path. Bound all phases and graph walks, including cache hits, and fail
  // closed rather than treating an incomplete analysis as a successful reset.
  function spendStep(node: Node = file.sourceFile) {
    if (--remainingSteps < 0) {
      throw new AnalysisLimitError(node);
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

  function lookup(name: string, current: Scope): Binding | undefined {
    for (let owner: Scope | undefined = current; owner; owner = owner.parent) {
      const binding = owner.bindings.get(name);
      if (binding) {
        return binding;
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
    spendStep(node);
    if (isFunction(node) || node.type === 'StaticBlock') {
      return;
    }
    if (node.type === 'VariableDeclaration' && node.kind === 'var') {
      for (const declaration of node.declarations) {
        declare(declaration.id, target);
      }
    }
    for (const child of children(node)) {
      collectVars(child, target);
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
          birthGuards.get(allocation)?.delete(condition);
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
    tail = false,
    root = false,
  ): Value {
    spendStep(call);
    if (
      value.kind !== 'function' ||
      value.node.generator ||
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
    const key = `${context.phase}:${allocationPath}:${value.node.start}:${value.scope.id}:${args.map(valueId).join(',')}`;
    const cached = callCache.get(key);
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
      for (const [index, parameter] of value.node.params.entries()) {
        bind(parameter, args[index] ?? MISSING, nested);
      }
      result = functionResult(value.node, nested);
      callCache.set(key, {
        value: result,
        guards: new Map(context.guards),
        allocations: nested.allocations,
      });
      for (const allocation of nested.allocations) {
        spendStep(call);
        context.allocations.add(allocation);
      }
    } finally {
      activeFunctions.delete(value.node);
    }
    return result;
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
      const leftGuards = birthGuards.get(left)!;
      for (const right of keys.slice(index + 1)) {
        spendStep();
        const rightGuards = birthGuards.get(right)!;
        if (
          ![...leftGuards].some(
            ([condition, outcome]) =>
              rightGuards.has(condition) && rightGuards.get(condition) !== outcome,
          )
        ) {
          return;
        }
      }
    }
    for (const key of keys) {
      resetCoverage.set(key, writeSlot(resetCoverage.get(key) ?? MISSING, literal(true), context));
    }
  }

  function mockKeys(
    value: Value,
    seen = new Set<Value>(),
    unknownExposure?: ReadonlySet<string>,
  ): Set<string> {
    spendStep();
    const keys = new Set<string>();
    if (seen.has(value)) {
      return keys;
    }
    seen.add(value);
    if (
      value.kind === 'unknown' ||
      value.kind === 'function' ||
      (value.kind === 'object' && value.unknownProperties)
    ) {
      // An opaque return value, callback, or spread could expose any mock
      // created by this factory. Do not infer that an outer reset discards it.
      for (const key of unknownExposure ?? []) {
        spendStep();
        keys.add(key);
      }
    }
    if (value.kind === 'mock') {
      keys.add(value.key);
    } else {
      const values =
        value.kind === 'object'
          ? value.properties.values()
          : value.kind === 'union'
            ? value.values
            : [];
      for (const child of values) {
        for (const key of mockKeys(resolveSlot(child), seen, unknownExposure)) {
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
    if (mock) {
      const guards = birthGuards.get(key)!;
      for (const [condition, outcome] of guards) {
        spendStep(node);
        if (context.guards.get(condition) !== outcome) {
          guards.delete(condition);
        }
      }
    } else {
      mock = { kind: 'mock', key };
      mocks.set(key, mock);
      birthGuards.set(key, new Map(context.guards));
    }
    context.allocations.add(key);
    if (context.phase === 'hoisted') {
      hoistedMocks.add(key);
    }
    return mock;
  }

  function callApi(api: string, args: Value[], context: Context, node: Node): Value {
    switch (api) {
      case 'vi.fn':
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
          false,
          true,
        );
        for (const key of allocations) {
          spendStep(node);
          context.allocations.add(key);
        }
        for (const key of mockKeys(value, new Set(), allocations)) {
          exposedMocks.add(key);
        }
        return value;
      }
      case 'vi.resetAllMocks':
        if (context.phase === 'reset') {
          globalResetCoverage = writeSlot(globalResetCoverage, literal(true), context);
        }
        break;
    }
    const base = api.split('.')[0];
    const curried = api.endsWith('.each') || api.endsWith('.for');
    if (COLLECTION_APIS.has(base) && !curried) {
      const callback = args.at(-1);
      if (callback?.kind === 'function') {
        invoke(callback, [], context, node, false, true);
      }
    } else if (RESET_APIS.has(base)) {
      const callback = args[0];
      if (callback?.kind === 'function') {
        resetCallbacks.push({ callback, context, call: node });
      }
    }
    return { kind: 'api', name: curried ? base : api };
  }

  function recordImplementation(receiver: Value, value: Value, context: Context) {
    const nestedMocks = mockKeys(value);
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
      recordImplementation(receiver, args[0] ?? UNKNOWN, context);
    }
    if (persistentMockMethodNames.has(method) && context.phase !== 'reset') {
      for (let part of members(receiver)) {
        if (part.kind !== 'mock' && context.phase === 'hoisted') {
          part = makeMock(node, context);
        }
        if (part.kind === 'mock' && (context.phase === 'hoisted' || hoistedMocks.has(part.key))) {
          setters.set(part.key, setters.get(part.key) ?? node);
        }
      }
    }
    return method.startsWith('mock') ? receiver : UNKNOWN;
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
      callee.type === 'Identifier' &&
      callable.kind === 'function' &&
      !lookup(callee.name, context.scope)?.directFunction
    ) {
      callable = UNKNOWN;
    }
    const spreadIndex = node.arguments.findIndex((argument) => argument.type === 'SpreadElement');
    const args = node.arguments.map((argument, index) => {
      const value = evaluate(
        argument.type === 'SpreadElement' ? argument.argument : argument,
        context,
      );
      return spreadIndex !== -1 && index >= spreadIndex ? UNKNOWN : value;
    });
    if (spreadIndex !== -1 && callable.kind === 'function') {
      while (args.length < callable.node.params.length) {
        args.push(UNKNOWN);
      }
    }
    if (callable.kind === 'api') {
      return callApi(callable.name, args, context, node);
    }
    if (receiver && method) {
      return callMockMethod(receiver, method, args, node, context);
    }
    return invoke(callable, args, context, node, tail);
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
    return { kind: 'object', properties, unknownProperties };
  }

  function evaluateArray(
    node: Extract<Node, { type: 'ArrayExpression' }>,
    context: Context,
  ): Value {
    const properties = new Map<string, ValueSlot>();
    let unknownProperties = false;
    let index = 0;
    for (const element of node.elements) {
      if (element?.type === 'SpreadElement') {
        const spread = evaluate(element.argument, context);
        if (spread.kind === 'object' && !spread.unknownProperties) {
          for (const value of spread.properties.values()) {
            spendStep(element);
            properties.set(String(index++), value);
          }
        } else {
          unknownProperties = true;
        }
      } else if (!unknownProperties) {
        properties.set(String(index++), element ? evaluate(element, context) : MISSING);
      } else if (element) {
        evaluate(element, context);
      }
    }
    return { kind: 'object', properties, unknownProperties };
  }

  function evaluateIdentifier(
    node: Extract<Node, { type: 'Identifier' }>,
    context: Context,
  ): Value {
    const binding = lookup(node.name, context.scope);
    if (binding) {
      return resolveSlot(binding.value, context.guards);
    }
    if (node.name === 'undefined') {
      return MISSING;
    }
    return node.name === 'vi' || COLLECTION_APIS.has(node.name) || RESET_APIS.has(node.name)
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
        continue;
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

  function evaluate(input: Node, context: Context, tail = false): Value {
    spendStep(input);
    const node = unwrap(input);
    switch (node.type) {
      case 'Identifier':
        return evaluateIdentifier(node, context);
      case 'Literal':
        return literal(node.value);
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
      case 'FunctionDeclaration':
        return functionValue(node, context.scope);
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
        return evaluateArray(node, context);
      case 'ConditionalExpression':
        return evaluateConditional(node, context, tail);
      case 'LogicalExpression':
        return evaluateLogical(node, context, tail);
      case 'SequenceExpression':
        return node.expressions.reduce<Value>(
          (_, expression, index) =>
            evaluate(expression, context, tail && index === node.expressions.length - 1),
          MISSING,
        );
      case 'UnaryExpression': {
        const value = evaluate(node.argument, context);
        if (node.operator === 'void') {
          return MISSING;
        }
        return node.operator === '!' && value.kind === 'literal' ? literal(!value.value) : UNKNOWN;
      }
      case 'AssignmentExpression':
        return evaluateAssignment(node, context);
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
        for (const child of children(node)) {
          if (!isFunction(child)) {
            evaluate(child, context);
          }
        }
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
    const continuationGuards =
      left && !left.fallsThrough
        ? (right?.continuationGuards ?? rightContext.guards)
        : right && !right.fallsThrough
          ? (left?.continuationGuards ?? leftContext.guards)
          : context.guards;
    return {
      value: union([...(left ? [left.value] : []), ...(right ? [right.value] : [])]),
      fallsThrough: !left || !right || left.fallsThrough || right.fallsThrough,
      continuationGuards,
    };
  }

  function executeSwitch(
    node: Extract<Node, { type: 'SwitchStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    evaluate(node.discriminant, context);
    const nested = { ...guarded(context, node, true), scope: scope(context.scope) };
    prepare(
      node.cases.flatMap((clause) => clause.consequent),
      nested.scope,
    );
    const returns: Value[] = [];
    let fallsThrough = !node.cases.some((clause) => clause.test === null);
    for (const clause of node.cases) {
      const result = executeStatements(clause.consequent, nested);
      if (result) {
        returns.push(result.value);
      }
      fallsThrough ||= !result || result.fallsThrough;
    }
    return returns.length ? { value: union(returns), fallsThrough } : undefined;
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
    if (node.update && (!result || result.fallsThrough)) {
      evaluate(node.update, bodyContext);
    }
    return result ? { value: result.value, fallsThrough: true } : undefined;
  }

  function executeForEach(
    node: Extract<Node, { type: 'ForInStatement' | 'ForOfStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    const nested = { ...context, scope: scope(context.scope) };
    evaluate(node.right, nested);
    if (node.left.type === 'VariableDeclaration') {
      const target = node.left.kind === 'var' ? nested.scope.varScope! : nested.scope;
      for (const declaration of node.left.declarations) {
        declare(declaration.id, target);
        bind(declaration.id, UNKNOWN, nested, target);
      }
    }
    const result = execute(node.body, guarded(nested, node, true));
    return result ? { value: result.value, fallsThrough: true } : undefined;
  }

  function executeWhile(
    node: Extract<Node, { type: 'WhileStatement' | 'DoWhileStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    let bodyContext = context;
    if (node.type === 'WhileStatement') {
      const test = evaluate(node.test, context);
      if (test.kind === 'literal' && !test.value) {
        return undefined;
      }
      if (test.kind !== 'literal') {
        bodyContext = guarded(context, node, true);
      }
    }
    const result = execute(node.body, bodyContext);
    if (node.type === 'DoWhileStatement') {
      if (result && !result.fallsThrough) {
        return result;
      }
      evaluate(
        node.test,
        result?.continuationGuards ? { ...context, guards: result.continuationGuards } : context,
      );
    }
    return result ? { value: result.value, fallsThrough: true } : undefined;
  }

  function executeTry(
    node: Extract<Node, { type: 'TryStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    const attempted = execute(node.block, node.handler ? guarded(context, node, true) : context);
    const recovered = node.handler
      ? execute(node.handler, guarded(context, node, false))
      : undefined;
    const final = node.finalizer ? execute(node.finalizer, context) : undefined;
    if (final && !final.fallsThrough) {
      return final;
    }
    const flows = node.handler ? [attempted, recovered] : [attempted];
    if (!final && flows.every((flow) => !flow)) {
      return undefined;
    }
    return {
      value: union([
        ...flows.flatMap((flow) => (flow ? [flow.value] : [])),
        ...(final ? [final.value] : []),
      ]),
      fallsThrough: flows.some((flow) => !flow || flow.fallsThrough),
    };
  }

  function execute(node: Node, context: Context): ReturnFlow | undefined {
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
    for (const statement of statements) {
      const returned = execute(statement, context);
      if (returned !== undefined) {
        returns.push(returned.value);
        if (!returned.fallsThrough) {
          return { value: union(returns), fallsThrough: false };
        }
        if (returned.continuationGuards) {
          context = { ...context, guards: returned.continuationGuards };
        }
      }
    }
    return returns.length
      ? { value: union(returns), fallsThrough: true, continuationGuards: context.guards }
      : undefined;
  }

  function guarded(context: Context, condition: Node, outcome: boolean): Context {
    const key = `${context.allocationPath}:${condition.start}`;
    return { ...context, guards: new Map([...context.guards, [key, outcome]]) };
  }

  try {
    const moduleScope = scope();
    collectVars(file.sourceFile, moduleScope);
    executeStatements(file.sourceFile.body, {
      scope: moduleScope,
      allocationPath: 'module',
      phase: 'collection',
      guards: new Map(),
      allocations: new Set(),
    });
    for (const { callback, context, call } of resetCallbacks) {
      invoke(callback, [], { ...context, phase: 'reset' }, call, false, true);
    }
    const globalReset = resolveSlot(globalResetCoverage);
    if (globalReset.kind === 'literal' && globalReset.value === true) {
      return undefined;
    }
    for (const [key, coverage] of resetCoverage) {
      const reset = resolveSlot(coverage);
      if (reset.kind === 'literal' && reset.value === true) {
        resets.add(key);
      }
    }
    // Resetting an implementation discards mocks reachable only through that
    // implementation's literal return value. A separately exposed or reinstalled
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
