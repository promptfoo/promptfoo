import { visitorKeys } from 'oxc-parser';
import type { ArrowFunctionExpression, Node, Function as OxcFunction } from 'oxc-parser';

import type { HygieneFile } from './engine';

type FunctionNode = ArrowFunctionExpression | OxcFunction;
type Value =
  | { kind: 'unknown' | 'missing' }
  | { kind: 'literal'; value: unknown }
  | { kind: 'mock'; key: string }
  | { kind: 'object'; properties: Map<string, Value>; unknownProperties: boolean }
  | { kind: 'function'; node: FunctionNode; scope: Scope; moduleVariable: boolean }
  | { kind: 'api'; name: string }
  | { kind: 'union'; values: Value[] };
type Binding = { value: Value; directFunction: boolean };
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
  guards: ReadonlyMap<number, boolean>;
  allocations: Set<string>;
};
type ReturnFlow = {
  value: Value;
  fallsThrough: boolean;
  continuationGuards?: ReadonlyMap<number, boolean>;
};
type CachedCall = {
  value: Value;
  guards: Map<number, boolean>;
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
const persistentMockPattern = new RegExp(
  `\\.(?:${[...persistentMockMethodNames].join('|')})\\s*\\(`,
);
const COLLECTION_APIS = new Set(['describe', 'suite']);
const RESET_APIS = new Set(['beforeEach', 'afterEach']);

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

function union(values: Value[]): Value {
  const unique = [
    ...new Set(values.flatMap((value) => (value.kind === 'union' ? value.values : [value]))),
  ];
  return unique.length === 1 ? unique[0] : { kind: 'union', values: unique };
}

function members(value: Value): Value[] {
  return value.kind === 'union' ? value.values : [value];
}

// A file-local provenance analysis, not a JavaScript runtime: follow direct
// synchronous helpers and literal containers, but never execute imports,
// methods, generators, or deferred callbacks. Each invocation owns its mock
// identities; forwarding an existing value never allocates another mock.
export function findHoistedPersistentMockWithoutReset(file: HygieneFile): Node | undefined {
  if (!/\bvi\.hoisted\s*\(/.test(file.source) || !persistentMockPattern.test(file.source)) {
    return undefined;
  }

  let nextScope = 0;
  const mocks = new Map<string, Value>();
  const setters = new Map<string, Node>();
  const resets = new Set<string>();
  const hoistedMocks = new Set<string>();
  const exposedMocks = new Set<string>();
  const implementationMocks = new Map<string, Set<string>>();
  const reusedMocks = new Set<string>();
  const resetCallbacks: { callback: Value; context: Context; call: Node }[] = [];
  const birthGuards = new Map<string, Map<number, boolean>>();
  const callCache = new Map<string, CachedCall>();
  const activeFunctions = new Set<FunctionNode>();
  const valueIds = new Map<Value, number>();
  const literals = new Map<unknown, Value>();
  let hasGlobalReset = false;

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

  function get(value: Value, key: string | undefined): Value {
    if (key === undefined) {
      return UNKNOWN;
    }
    return union(
      members(value).map((part) => {
        if (part.kind === 'object') {
          return part.properties.get(key) ?? (part.unknownProperties ? UNKNOWN : MISSING);
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
    if (pattern.type === 'Identifier') {
      target.bindings.set(pattern.name, { value, directFunction });
    } else if (pattern.type === 'AssignmentPattern') {
      const effective = members(value).map((part) =>
        part.kind === 'missing'
          ? evaluate(pattern.right, context)
          : part.kind === 'unknown'
            ? union([part, evaluate(pattern.right, context)])
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
            get(value, propertyName(property.key, property.computed)),
            context,
            target,
          );
        }
      }
    } else if (pattern.type === 'ArrayPattern') {
      for (const [index, element] of pattern.elements.entries()) {
        if (element) {
          bind(element, get(value, String(index)), context, target);
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
      if (context.guards.get(condition) !== outcome) {
        cached.guards.delete(condition);
        for (const allocation of cached.allocations) {
          birthGuards.get(allocation)?.delete(condition);
        }
      }
    }
    for (const allocation of cached.allocations) {
      context.allocations.add(allocation);
    }
    return cached.value;
  }

  function invoke(
    value: Value,
    args: Value[],
    context: Context,
    call: Node,
    tail = false,
    root = false,
  ): Value {
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
      if (!value.node.body) {
        result = MISSING;
      } else if (value.node.body.type === 'BlockStatement') {
        const flow = executeStatements(value.node.body.body, nested);
        result = flow ? (flow.fallsThrough ? union([flow.value, MISSING]) : flow.value) : MISSING;
      } else {
        result = evaluate(value.node.body, nested, true);
      }
      callCache.set(key, {
        value: result,
        guards: new Map(context.guards),
        allocations: nested.allocations,
      });
      for (const allocation of nested.allocations) {
        context.allocations.add(allocation);
      }
    } finally {
      activeFunctions.delete(value.node);
    }
    return result;
  }

  function markReset(value: Value) {
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
      resets.add(key);
    }
  }

  function mockKeys(value: Value, seen = new Set<Value>()): Set<string> {
    const keys = new Set<string>();
    if (seen.has(value)) {
      return keys;
    }
    seen.add(value);
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
        for (const key of mockKeys(child, seen)) {
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
        const value = invoke(
          args[0] ?? UNKNOWN,
          [],
          { ...context, phase: 'hoisted' },
          node,
          false,
          true,
        );
        for (const key of mockKeys(value)) {
          exposedMocks.add(key);
        }
        return value;
      }
      case 'vi.resetAllMocks':
        hasGlobalReset = true;
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
        implementationMocks.set(part.key, nestedMocks);
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
      markReset(receiver);
    }
    if (method === 'mockResolvedValue' || method === 'mockReturnValue') {
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
    let callable = receiver ? get(receiver, method) : evaluate(callee, context);
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
    const properties = new Map<string, Value>();
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
    const properties = new Map<string, Value>();
    let unknownProperties = false;
    let index = 0;
    for (const element of node.elements) {
      if (element?.type === 'SpreadElement') {
        const spread = evaluate(element.argument, context);
        if (spread.kind === 'object' && !spread.unknownProperties) {
          for (const value of spread.properties.values()) {
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
      return binding.value;
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

  function evaluate(input: Node, context: Context, tail = false): Value {
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
        return get(object, propertyName(node.property, node.computed));
      }
      case 'ObjectExpression':
        return evaluateObject(node, context);
      case 'ArrayExpression':
        return evaluateArray(node, context);
      case 'ConditionalExpression':
        return evaluateConditional(node, context, tail);
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
      case 'AssignmentExpression': {
        const value = evaluate(node.right, context);
        const binding =
          node.left.type === 'Identifier' ? lookup(node.left.name, context.scope) : undefined;
        if (binding) {
          binding.value = UNKNOWN;
          binding.directFunction = false;
        }
        return value;
      }
      case 'ClassExpression':
        executeClass(node, context);
        return UNKNOWN;
      case 'TaggedTemplateExpression': {
        const tag = evaluate(node.tag, context);
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
    for (const member of node.body.body) {
      if (member.type === 'StaticBlock') {
        const owner = scope(context.scope, true);
        for (const statement of member.body) {
          collectVars(statement, owner);
        }
        executeStatements(member.body, { ...context, scope: owner });
      } else if (member.type === 'PropertyDefinition' && member.static && member.value) {
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
    const nested = { ...context, scope: scope(context.scope) };
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

  function executeLoop(
    node: Extract<Node, { type: 'ForStatement' | 'ForInStatement' | 'ForOfStatement' }>,
    context: Context,
  ): ReturnFlow | undefined {
    const nested = { ...context, scope: scope(context.scope) };
    if (node.type === 'ForStatement') {
      if (node.init?.type === 'VariableDeclaration') {
        prepare([node.init], nested.scope);
        executeVariables(node.init, nested);
      } else if (node.init) {
        evaluate(node.init, nested);
      }
      if (node.test) {
        evaluate(node.test, nested);
      }
      if (node.update) {
        evaluate(node.update, nested);
      }
    } else {
      evaluate(node.right, nested);
      if (node.left.type === 'VariableDeclaration') {
        const target = node.left.kind === 'var' ? nested.scope.varScope! : nested.scope;
        for (const declaration of node.left.declarations) {
          declare(declaration.id, target);
          bind(declaration.id, UNKNOWN, nested, target);
        }
      }
    }
    const result = execute(node.body, nested);
    return result ? { value: result.value, fallsThrough: true } : undefined;
  }

  function execute(node: Node, context: Context): ReturnFlow | undefined {
    switch (node.type) {
      case 'ExpressionStatement':
        evaluate(node.expression, context);
        break;
      case 'ReturnStatement':
        return {
          value: node.argument ? evaluate(node.argument, context, true) : MISSING,
          fallsThrough: false,
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
      case 'ForInStatement':
      case 'ForOfStatement':
        return executeLoop(node, context);
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
    return { ...context, guards: new Map([...context.guards, [condition.start, outcome]]) };
  }

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
  if (hasGlobalReset) {
    return undefined;
  }
  // Resetting an implementation discards mocks reachable only through that
  // implementation's literal return value. A separately exposed or reinstalled
  // mock still needs its own reset.
  for (const key of resets) {
    for (const nested of implementationMocks.get(key) ?? []) {
      if (!exposedMocks.has(nested) && !reusedMocks.has(nested)) {
        resets.add(nested);
      }
    }
  }
  return [...setters.entries()]
    .filter(([key]) => !resets.has(key))
    .map(([, node]) => node)
    .sort((left, right) => left.start - right.start)[0];
}
