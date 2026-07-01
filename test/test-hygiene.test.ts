import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  compareDiagnostics,
  createDiagnostic,
  createHygieneFile,
  formatDiagnostic,
  type HygieneDiagnostic,
  type HygieneFile,
  type HygieneScanSummary,
  scanHygieneFiles,
  sortDiagnostics,
} from './hygiene/engine';

type TestControlKind = 'only' | 'skip' | 'skipIf';

type TestControlUsage = HygieneDiagnostic & {
  expression: string;
  kind: TestControlKind;
  trimmedLineText: string;
};

type AllowedSkip = {
  file: string;
  kind: Exclude<TestControlKind, 'only'>;
  linePattern: RegExp;
  reason: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDir = path.join(repoRoot, 'test');
const biomeConfigPath = path.join(repoRoot, 'biome.jsonc');
const thisFile = fileURLToPath(import.meta.url);
const testApiNames = new Set(['describe', 'it', 'suite', 'test']);
const directProcessEnvMutationPluginPath = './tools/biome/no-direct-process-env-mutation.grit';
const directProcessEnvMutationPluginIncludes = [
  '*.js',
  '*.jsx',
  '*.ts',
  '*.tsx',
  '*.mjs',
  '*.cjs',
  '**/*.js',
  '**/*.jsx',
  '**/*.ts',
  '**/*.tsx',
  '**/*.mjs',
  '**/*.cjs',
];

const allowedSkippedTests: AllowedSkip[] = [
  {
    file: 'integration/library-exports.integration.test.ts',
    kind: 'skip',
    linePattern: /buildExists \? describe : describe\.skip/,
    reason: 'requires built dist artifacts when this integration file runs outside build jobs',
  },
  {
    file: 'prompts/processors/executable.test.ts',
    kind: 'skip',
    linePattern: /process\.platform === 'win32' \? describe\.skip : describe/,
    reason: 'Unix executable-path coverage is intentionally disabled on Windows',
  },
  {
    file: 'blobs/extractor.test.ts',
    kind: 'skip',
    linePattern: /isBlobStorageEnabled\(\) \? it : it\.skip/,
    reason: 'Blob storage integration coverage requires opt-in storage credentials',
  },
  {
    file: 'python/worker.test.ts',
    kind: 'skip',
    linePattern: /process\.platform === 'win32' && process\.env\.CI \? describe\.skip : describe/,
    reason: 'Python temp-file IPC is unreliable under Windows CI security policy',
  },
  {
    file: 'python/workerPool.test.ts',
    kind: 'skip',
    linePattern: /process\.platform === 'win32' && process\.env\.CI \? describe\.skip : describe/,
    reason: 'Python temp-file IPC is unreliable under Windows CI security policy',
  },
  {
    file: 'providers/pythonCompletion.unicode.test.ts',
    kind: 'skip',
    linePattern: /process\.platform === 'win32' && process\.env\.CI \? describe\.skip : describe/,
    reason: 'Python provider temp-file IPC is unreliable under Windows CI security policy',
  },
  {
    file: 'providers/openai-codex-sdk.e2e.test.ts',
    kind: 'skip',
    linePattern: /hasApiKey && hasSdk \? describe : describe\.skip/,
    reason: 'E2E coverage requires an API key and optional Codex SDK dependency',
  },
  {
    file: 'commands/mcp/lib/security.test.ts',
    kind: 'skipIf',
    linePattern:
      /^it\.skipIf\(process\.platform === 'win32'\)\('should reject paths to system directories'/,
    reason: 'Unix system-directory assertions are platform-specific',
  },
  {
    file: 'commands/mcp/lib/security.test.ts',
    kind: 'skipIf',
    linePattern:
      /^it\.skipIf\(process\.platform !== 'win32'\)\('should reject Windows system directories'/,
    reason: 'Windows system-directory assertions are platform-specific',
  },
  {
    file: 'commands/mcp/lib/security.test.ts',
    kind: 'skipIf',
    linePattern: /^it\.skipIf\(process\.platform === 'win32'\)\($/,
    reason: 'Unix absolute-path assertions are platform-specific',
  },
  {
    file: 'smoke/regression-0120.test.ts',
    kind: 'skipIf',
    linePattern: /^it\.skipIf\(!isGoAvailable\(\)\)\('loads and executes Go provider'/,
    reason: 'Go smoke coverage requires the Go toolchain',
  },
  {
    file: 'smoke/regression-0120.test.ts',
    kind: 'skipIf',
    linePattern: /^it\.skipIf\(!isRubyAvailable\(\)\)\('loads and executes Ruby provider'/,
    reason: 'Ruby smoke coverage requires the Ruby toolchain',
  },
  {
    file: 'smoke/extension-hooks.test.ts',
    kind: 'skipIf',
    linePattern: /^it\.skipIf\(!PYTHON_PATH\)\($/,
    reason: 'Python extension-hook smoke coverage requires an available Python interpreter',
  },
  {
    file: 'redteam/plugins/codingAgent.test.ts',
    kind: 'skipIf',
    linePattern: /^it\.skipIf\(process\.platform === 'win32'\)\($/,
    reason: 'Host-side unreadable-file sandbox coverage depends on Unix permissions',
  },
  {
    file: 'examples/integrationLangchain.test.ts',
    kind: 'skip',
    linePattern: /const itPy = PYTHON_PATH \? it : it\.skip;/,
    reason: 'LangChain example subprocess coverage requires an available Python interpreter',
  },
];

const legacyHoistedPersistentMockFiles = new Set<string>();

const legacyDirectProcessEnvMutationFiles = new Set<string>();

const legacySleepPromiseFiles = new Set<string>([
  // Real wall-clock waits are intentional here:
  //  - database.test.ts: gives the OS time to release Windows file locks
  //    between cleanup attempts.
  //  - smoke/resume.test.ts: paces SIGINTs to a spawned CLI subprocess.
  'database.test.ts',
  'smoke/resume.test.ts',
]);

const legacyModuleScopePersistentMockFiles = new Set<string>([
  'assertions/runAssertion.test.ts',
  'assertions/runAssertions.test.ts',
  'assertions/similar.test.ts',
  'cache.test.ts',
  'codeScans/scanner/request.test.ts',
  'commands/eval/evaluateOptions.test.ts',
  'commands/export.test.ts',
  'commands/mcp/server.test.ts',
  'commands/mcp/tools/runEvaluation.test.ts',
  'commands/view.test.ts',
  'evaluator.integration.realTransforms.test.ts',
  'evaluatorHelpers.test.ts',
  'external/assertions.test.ts',
  'external/conversationRelevancy.test.ts',
  'globalConfig.test.ts',
  'googleSheets.test.ts',
  'index.test.ts',
  'integration/envPath.test.ts',
  'migrate.test.ts',
  'prompts/index.test.ts',
  'providers/anthropic/completion.test.ts',
  'providers/anthropic/defaults.test.ts',
  'providers/bedrock/agents.test.ts',
  'providers/bedrock/converse.test.ts',
  'providers/bedrock/knowledgeBase.test.ts',
  'providers/bedrock/luma-ray.test.ts',
  'providers/bedrock/nova-reel.test.ts',
  'providers/bedrock/nova-sonic.test.ts',
  'providers/browser.test.ts',
  'providers/cloudflare-ai.test.ts',
  'providers/cloudflare-gateway.test.ts',
  'providers/github/defaults.test.ts',
  'providers/google/ai.studio.test.ts',
  'providers/google/auth.test.ts',
  'providers/google/base.test.ts',
  'providers/google/gemini-image.test.ts',
  'providers/google/gemini-mcp-integration.test.ts',
  'providers/google/image.test.ts',
  'providers/google/live.test.ts',
  'providers/google/provider.test.ts',
  'providers/google/util.test.ts',
  'providers/google/vertex.test.ts',
  'providers/google/video.test.ts',
  'providers/http-tls.test.ts',
  'providers/huggingface.test.ts',
  'providers/index.test.ts',
  'providers/mcp/authProvider.test.ts',
  'providers/openai-codex-sdk.test.ts',
  'providers/openai/chatkit-pool.test.ts',
  'providers/openai/chatkit.test.ts',
  'providers/pythonCompletion.cliState.test.ts',
  'providers/registry.test.ts',
  'providers/responses/processor.test.ts',
  'providers/sagemaker.test.ts',
  'providers/simulatedUser.test.ts',
  'providers/watsonx.test.ts',
  'redteam/commands/crossSessionLeakGenerate.test.ts',
  'redteam/commands/generate.test.ts',
  'commands/redteam/report.test.ts',
  'redteam/extraction/entities.test.ts',
  'redteam/extraction/purpose.test.ts',
  'redteam/extraction/util.test.ts',
  'redteam/plugins/base.test.ts',
  'redteam/plugins/canGenerateRemote.test.ts',
  'redteam/plugins/codingAgent.test.ts',
  'redteam/plugins/index.test.ts',
  'redteam/plugins/intent.test.ts',
  'redteam/plugins/pliny.test.ts',
  'redteam/plugins/unsafebench.test.ts',
  'redteam/providers/authoritativeMarkupInjection.test.ts',
  'redteam/providers/bestOfN.test.ts',
  'redteam/providers/crescendo/index.test.ts',
  'redteam/providers/goat.test.ts',
  'redteam/providers/hydra/index.test.ts',
  'redteam/providers/indirectWebPwn.test.ts',
  'redteam/providers/iterative.test.ts',
  'redteam/providers/iterativeImage.test.ts',
  'redteam/providers/multi-turn-empty-response.test.ts',
  'redteam/strategies/citation.test.ts',
  'redteam/strategies/gcg.test.ts',
  'redteam/strategies/simpleAudio.test.ts',
  'redteam/strategies/simpleVideo.test.ts',
  'sagemaker.test.ts',
  'server/findStaticDir.test.ts',
  'server/server.test.ts',
  'telemetry.test.ts',
  'tracing/integration.test.ts',
  'util/agent/fsOperations.test.ts',
  'util/config/load.test.ts',
  'util/jsonExport.test.ts',
  'util/jsonlOutput.test.ts',
  'util/testCaseReader.test.ts',
  'util/transform.test.ts',
  'node/testProvider.test.ts',
]);

const hoistedMockPattern = /\bvi\.hoisted\s*\(/;
const persistentMockMethods = [
  'mockImplementation',
  'mockRejectedValue',
  'mockResolvedValue',
  'mockReturnValue',
] as const;
const persistentMockMethodNames = new Set<string>(persistentMockMethods);
const persistentMockImplementationPattern = new RegExp(
  `\\.(?:${persistentMockMethods.join('|')})\\s*\\(`,
);
// Only `vi.resetAllMocks()` is trusted as a file-level signal that every
// `vi.fn()`-style mock has its persistent implementation reset between tests.
// Per-mock helpers (.mockReset()/.mockRestore()) only reset the specific mock
// they are called on, and `vi.restoreAllMocks()` is documented as targeting
// `vi.spyOn` mocks specifically — relying on it to reset module-scope
// `vi.fn().mockReturnValue(...)` defaults is fragile, so it does not count.
// See https://vitest.dev/api/vi#vi-restoreallmocks.
const processEnvSnapshotIdentifierPattern = /^original[A-Za-z0-9_]*$/i;

function findVitestNamespaceImports(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const namespaces = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'vitest' ||
      !statement.importClause?.namedBindings ||
      !ts.isNamespaceImport(statement.importClause.namedBindings)
    ) {
      continue;
    }
    namespaces.add(statement.importClause.namedBindings.name.text);
  }

  return namespaces;
}

function isVitestViExpression(node: ts.Node, vitestNamespaces: ReadonlySet<string>): boolean {
  return (
    (ts.isIdentifier(node) && node.text === 'vi') ||
    (ts.isPropertyAccessExpression(node) &&
      node.name.text === 'vi' &&
      ts.isIdentifier(node.expression) &&
      vitestNamespaces.has(node.expression.text))
  );
}

function isViMethodCall(
  node: ts.Node,
  method: string,
  vitestNamespaces: ReadonlySet<string>,
): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === method &&
    isVitestViExpression(node.expression.expression, vitestNamespaces)
  );
}

function hasViMethodCall(
  sourceFile: ts.SourceFile,
  method: string,
  vitestNamespaces: ReadonlySet<string>,
): boolean {
  let found = false;
  function visit(node: ts.Node) {
    if (found) {
      return;
    }
    if (isViMethodCall(node, method, vitestNamespaces)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function isViHoistedCall(
  node: ts.Node,
  vitestNamespaces: ReadonlySet<string>,
): node is ts.CallExpression {
  return isViMethodCall(node, 'hoisted', vitestNamespaces);
}

type MockAccessPath = {
  root: ts.Identifier;
  properties: readonly string[];
};

// Match resets to the exact lexical binding exposed by a hoisted factory.
// Keeping declaration identities (rather than identifier text) prevents an
// unrelated local shadow from invalidating or satisfying a module-level reset.
type MockBinding = {
  identifier: ts.Identifier;
  initializer?: ts.Expression;
  scope: ts.Node;
  sourcePath?: MockAccessPath;
};

type MockBindingIndex = ReadonlyMap<string, readonly MockBinding[]>;

function findHoistedVariableDeclaration(
  call: ts.CallExpression,
): ts.VariableDeclaration | undefined {
  let current: ts.Node = call;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent)) &&
    current.parent.expression === current
  ) {
    current = current.parent;
  }

  if (
    current.parent &&
    ts.isVariableDeclaration(current.parent) &&
    current.parent.initializer === current
  ) {
    return current.parent;
  }
  return undefined;
}

function getStaticElementAccessProperty(node: ts.Expression | undefined): string | undefined {
  if (
    node &&
    (ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isNumericLiteral(node) ||
      ts.isBigIntLiteral(node))
  ) {
    return node.text;
  }
  return undefined;
}

function getMockAccessPath(
  node: ts.Expression,
  vitestNamespaces: ReadonlySet<string>,
): MockAccessPath | undefined {
  const current = unwrapExpression(node);
  if (ts.isIdentifier(current)) {
    return { root: current, properties: [] };
  }
  if (isViMethodCall(current, 'mocked', vitestNamespaces) && current.arguments[0]) {
    return getMockAccessPath(current.arguments[0], vitestNamespaces);
  }
  if (ts.isPropertyAccessExpression(current)) {
    const path = getMockAccessPath(current.expression, vitestNamespaces);
    return path
      ? { root: path.root, properties: [...path.properties, current.name.text] }
      : undefined;
  }
  if (ts.isElementAccessExpression(current)) {
    const property = getStaticElementAccessProperty(current.argumentExpression);
    const path = getMockAccessPath(current.expression, vitestNamespaces);
    return path && property !== undefined
      ? { root: path.root, properties: [...path.properties, property] }
      : undefined;
  }
  return undefined;
}

function mockAccessPathKey(path: MockAccessPath): string {
  return JSON.stringify([path.root.pos, ...path.properties]);
}

function resolveMockAccessPath(
  path: MockAccessPath,
  bindings: MockBindingIndex,
  seenBindings: ReadonlySet<number> = new Set<number>(),
): MockAccessPath | undefined {
  const binding = findVisibleMockBinding(path.root, bindings);
  if (!binding) {
    return path;
  }
  if (seenBindings.has(binding.identifier.pos)) {
    return undefined;
  }
  if (!binding.sourcePath) {
    return { root: binding.identifier, properties: path.properties };
  }
  const resolvedSource = resolveMockAccessPath(
    binding.sourcePath,
    bindings,
    new Set([...seenBindings, binding.identifier.pos]),
  );
  return resolvedSource
    ? {
        root: resolvedSource.root,
        properties: [...resolvedSource.properties, ...path.properties],
      }
    : undefined;
}

function findMockBindingScope(declaration: ts.VariableDeclaration): ts.Node {
  if (ts.isCatchClause(declaration.parent)) {
    return declaration.parent;
  }
  const declarationList = declaration.parent;
  const isBlockScoped =
    ts.isVariableDeclarationList(declarationList) &&
    (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
  let current: ts.Node | undefined = declaration.parent;

  while (current) {
    if (ts.isSourceFile(current)) {
      return current;
    }
    if (!isBlockScoped && isFunctionLikeNode(current)) {
      return current;
    }
    if (
      isBlockScoped &&
      (ts.isBlock(current) ||
        ts.isModuleBlock(current) ||
        ts.isCaseBlock(current) ||
        ts.isCatchClause(current) ||
        ts.isForStatement(current) ||
        ts.isForInStatement(current) ||
        ts.isForOfStatement(current))
    ) {
      return current;
    }
    current = current.parent;
  }
  return declaration.getSourceFile();
}

function findBlockBindingScope(declaration: ts.Node): ts.Node {
  let current: ts.Node | undefined = declaration.parent;
  while (current) {
    if (
      ts.isSourceFile(current) ||
      ts.isBlock(current) ||
      ts.isModuleBlock(current) ||
      ts.isCaseBlock(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return declaration.getSourceFile();
}

function appendMockAccessProperty(
  path: MockAccessPath | undefined,
  property: string,
): MockAccessPath | undefined {
  return path ? { root: path.root, properties: [...path.properties, property] } : undefined;
}

function addMockBinding(
  identifier: ts.Identifier,
  scope: ts.Node,
  bindings: Map<string, MockBinding[]>,
  initializer?: ts.Expression,
  sourcePath?: MockAccessPath,
) {
  const existing = bindings.get(identifier.text) ?? [];
  existing.push({ identifier, initializer, scope, sourcePath });
  bindings.set(identifier.text, existing);
}

function addShadowBindings(
  name: ts.BindingName,
  scope: ts.Node,
  bindings: Map<string, MockBinding[]>,
) {
  if (ts.isIdentifier(name)) {
    addMockBinding(name, scope, bindings);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      addShadowBindings(element.name, scope, bindings);
    }
  }
}

function addMockBindings(
  name: ts.BindingName,
  declaration: ts.VariableDeclaration,
  sourcePath: MockAccessPath | undefined,
  bindings: Map<string, MockBinding[]>,
) {
  if (ts.isIdentifier(name)) {
    addMockBinding(
      name,
      findMockBindingScope(declaration),
      bindings,
      declaration.name === name ? declaration.initializer : undefined,
      sourcePath,
    );
    return;
  }

  if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (element.dotDotDotToken) {
        continue;
      }
      const property = element.propertyName
        ? getPropertyNameText(element.propertyName)
        : ts.isIdentifier(element.name)
          ? element.name.text
          : undefined;
      if (property !== undefined) {
        addMockBindings(
          element.name,
          declaration,
          appendMockAccessProperty(sourcePath, property),
          bindings,
        );
      }
    }
    return;
  }

  for (const [index, element] of name.elements.entries()) {
    if (!ts.isOmittedExpression(element) && !element.dotDotDotToken) {
      addMockBindings(
        element.name,
        declaration,
        appendMockAccessProperty(sourcePath, String(index)),
        bindings,
      );
    }
  }
}

function findMockBindings(
  sourceFile: ts.SourceFile,
  vitestNamespaces: ReadonlySet<string>,
): MockBindingIndex {
  const bindings = new Map<string, MockBinding[]>();

  function addImportShadows(node: ts.ImportDeclaration) {
    const clause = node.importClause;
    if (!clause) {
      return;
    }
    if (clause.name) {
      addMockBinding(clause.name, sourceFile, bindings);
    }
    const namedBindings = clause.namedBindings;
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      addMockBinding(namedBindings.name, sourceFile, bindings);
    } else if (namedBindings) {
      for (const element of namedBindings.elements) {
        addMockBinding(element.name, sourceFile, bindings);
      }
    }
  }

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node)) {
      const sourcePath = node.initializer
        ? getMockAccessPath(node.initializer, vitestNamespaces)
        : undefined;
      addMockBindings(node.name, node, sourcePath, bindings);
    } else if (ts.isParameter(node)) {
      addShadowBindings(node.name, node.parent, bindings);
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      addMockBinding(node.name, findBlockBindingScope(node), bindings);
    } else if (ts.isFunctionExpression(node) && node.name) {
      addMockBinding(node.name, node, bindings);
    } else if (ts.isClassDeclaration(node) && node.name) {
      addMockBinding(node.name, findBlockBindingScope(node), bindings);
    } else if (ts.isClassExpression(node) && node.name) {
      addMockBinding(node.name, node, bindings);
    } else if (ts.isImportDeclaration(node)) {
      addImportShadows(node);
    } else if (ts.isImportEqualsDeclaration(node)) {
      addMockBinding(node.name, sourceFile, bindings);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bindings;
}

function findVisibleMockBinding(
  identifier: ts.Identifier,
  bindings: MockBindingIndex,
): MockBinding | undefined {
  const candidates = bindings.get(identifier.text) ?? [];
  const exactBinding = candidates.find((binding) => binding.identifier === identifier);
  if (exactBinding) {
    return exactBinding;
  }

  const visibleBindings = candidates
    .filter((binding) => isDescendantOf(identifier, binding.scope))
    .sort((left, right) => left.scope.end - left.scope.pos - (right.scope.end - right.scope.pos));
  if (visibleBindings.length === 0) {
    return undefined;
  }
  const narrowestScope = visibleBindings[0].scope;
  return visibleBindings.filter((binding) => binding.scope === narrowestScope).length === 1
    ? visibleBindings[0]
    : undefined;
}

function findHoistedResetCoverage(
  sourceFile: ts.SourceFile,
  vitestNamespaces: ReadonlySet<string>,
  bindings: MockBindingIndex,
): { hasGlobalReset: boolean; resetPaths: ReadonlySet<string> } {
  let hasGlobalReset = false;
  const resetPaths = new Set<string>();

  function visit(node: ts.Node) {
    if (isViMethodCall(node, 'resetAllMocks', vitestNamespaces)) {
      hasGlobalReset = true;
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'mockReset'
    ) {
      const path = getMockAccessPath(node.expression.expression, vitestNamespaces);
      const resolvedPath = path ? resolveMockAccessPath(path, bindings) : undefined;
      if (resolvedPath) {
        resetPaths.add(mockAccessPathKey(resolvedPath));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { hasGlobalReset, resetPaths };
}

function isDescendantOf(node: ts.Node, ancestor: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function collectFactoryReturnExpressions(factory: InvokableFunction): ts.Expression[] {
  if (!factory.body) {
    return [];
  }
  if (ts.isArrowFunction(factory) && !ts.isBlock(factory.body)) {
    return [factory.body];
  }

  const expressions: ts.Expression[] = [];
  function visit(node: ts.Node) {
    if (node !== factory.body && isFunctionLikeNode(node)) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(factory.body);
  return expressions;
}

type SetterExposureContext = {
  bindings: MockBindingIndex;
  functionBindings: Map<ts.Node, ReadonlyMap<string, LexicalBinding>>;
  activeBindings: ReadonlySet<number>;
  activeFunctions: ReadonlySet<number>;
  invocationPath: readonly number[];
  setterReceiverPath?: MockAccessPath;
  vitestNamespaces: ReadonlySet<string>;
};

type SetterExposure = {
  instanceKey: string;
  path: readonly string[];
};

function createSetterExposure(
  setter: ts.CallExpression,
  context: SetterExposureContext,
  path: readonly string[],
): SetterExposure {
  return {
    instanceKey: JSON.stringify([...context.invocationPath, setter.pos]),
    path,
  };
}

function findMockAccessSuffix(
  exposedPath: MockAccessPath,
  targetPath: MockAccessPath,
): readonly string[] | undefined {
  if (
    exposedPath.root.pos !== targetPath.root.pos ||
    exposedPath.properties.length > targetPath.properties.length ||
    exposedPath.properties.some((property, index) => targetPath.properties[index] !== property)
  ) {
    return undefined;
  }
  return targetPath.properties.slice(exposedPath.properties.length);
}

function findSetterReceiverExposurePath(
  expression: ts.Expression,
  setter: ts.CallExpression,
  context: SetterExposureContext,
  prefix: readonly string[],
): SetterExposure | undefined {
  if (!context.setterReceiverPath) {
    return undefined;
  }
  const currentPath = getMockAccessPath(expression, context.vitestNamespaces);
  const resolvedCurrentPath = currentPath
    ? resolveMockAccessPath(currentPath, context.bindings)
    : undefined;
  const suffix = resolvedCurrentPath
    ? findMockAccessSuffix(resolvedCurrentPath, context.setterReceiverPath)
    : undefined;
  return suffix ? createSetterExposure(setter, context, [...prefix, ...suffix]) : undefined;
}

function findObjectSetterExposurePaths(
  object: ts.ObjectLiteralExpression,
  setter: ts.CallExpression,
  context: SetterExposureContext,
  prefix: readonly string[],
): SetterExposure[] {
  const paths: SetterExposure[] = [];
  for (const property of object.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      paths.push(
        ...findSetterExposurePaths(property.name, setter, context, [...prefix, property.name.text]),
      );
    } else if (ts.isPropertyAssignment(property)) {
      const propertyName = getPropertyNameText(property.name);
      if (propertyName !== undefined) {
        paths.push(
          ...findSetterExposurePaths(property.initializer, setter, context, [
            ...prefix,
            propertyName,
          ]),
        );
      }
    }
  }
  return paths;
}

function findSetterExposurePaths(
  expression: ts.Expression,
  setter: ts.CallExpression,
  context: SetterExposureContext,
  prefix: readonly string[] = [],
): SetterExposure[] {
  const current = unwrapExpression(expression);
  if (current === setter) {
    return [createSetterExposure(setter, context, prefix)];
  }

  const receiverExposurePath = findSetterReceiverExposurePath(
    current as ts.Expression,
    setter,
    context,
    prefix,
  );
  if (receiverExposurePath) {
    return [receiverExposurePath];
  }

  if (ts.isIdentifier(current)) {
    const binding = findVisibleMockBinding(current, context.bindings);
    if (!binding?.initializer || context.activeBindings.has(binding.identifier.pos)) {
      return [];
    }
    return findSetterExposurePaths(
      binding.initializer,
      setter,
      {
        ...context,
        activeBindings: new Set([...context.activeBindings, binding.identifier.pos]),
      },
      prefix,
    );
  }

  if (ts.isConditionalExpression(current)) {
    return [
      ...findSetterExposurePaths(current.whenTrue, setter, context, prefix),
      ...findSetterExposurePaths(current.whenFalse, setter, context, prefix),
    ];
  }

  if (ts.isObjectLiteralExpression(current)) {
    return findObjectSetterExposurePaths(current, setter, context, prefix);
  }

  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.flatMap((element, index) =>
      ts.isOmittedExpression(element)
        ? []
        : ts.isSpreadElement(element)
          ? []
          : findSetterExposurePaths(element, setter, context, [...prefix, String(index)]),
    );
  }

  if (ts.isCallExpression(current)) {
    if (
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text.startsWith('mock')
    ) {
      const receiverPaths = findSetterExposurePaths(
        current.expression.expression,
        setter,
        context,
        prefix,
      );
      if (receiverPaths.length > 0) {
        return receiverPaths;
      }
    }

    const invoked = resolveInvokedFunction(current.expression, context.functionBindings);
    if (!invoked?.body || context.activeFunctions.has(invoked.pos)) {
      return [];
    }
    const nextContext = {
      ...context,
      activeFunctions: new Set([...context.activeFunctions, invoked.pos]),
      invocationPath: [...context.invocationPath, current.pos],
    };
    return collectFactoryReturnExpressions(invoked).flatMap((returned) =>
      findSetterExposurePaths(returned, setter, nextContext, prefix),
    );
  }

  return [];
}

function findPersistentMockFactoryPathGroups(
  factoryNode: ts.Node,
  setter: ts.CallExpression,
  bindings: MockBindingIndex,
  vitestNamespaces: ReadonlySet<string>,
): readonly (readonly (readonly string[])[])[] {
  const functionBindings = new Map<ts.Node, ReadonlyMap<string, LexicalBinding>>();
  const factory = resolveInvokedFunction(factoryNode, functionBindings);
  if (!factory?.body) {
    return [];
  }

  const setterReceiver = ts.isPropertyAccessExpression(setter.expression)
    ? setter.expression.expression
    : undefined;
  const setterReceiverPath = setterReceiver
    ? getMockAccessPath(setterReceiver, vitestNamespaces)
    : undefined;

  const context: SetterExposureContext = {
    bindings,
    functionBindings,
    activeBindings: new Set<number>(),
    activeFunctions: new Set([factory.pos]),
    invocationPath: [],
    setterReceiverPath: setterReceiverPath
      ? resolveMockAccessPath(setterReceiverPath, bindings)
      : undefined,
    vitestNamespaces,
  };
  const exposures = collectFactoryReturnExpressions(factory).flatMap((expression) =>
    findSetterExposurePaths(expression, setter, context),
  );
  const pathsByInstance = new Map<string, (readonly string[])[]>();
  for (const exposure of exposures) {
    const paths = pathsByInstance.get(exposure.instanceKey) ?? [];
    paths.push(exposure.path);
    pathsByInstance.set(exposure.instanceKey, paths);
  }
  return [...pathsByInstance.values()];
}

function bindFactoryPath(
  name: ts.BindingName,
  properties: readonly string[],
): MockAccessPath | undefined {
  if (ts.isIdentifier(name)) {
    return { root: name, properties };
  }
  if (properties.length === 0) {
    return undefined;
  }

  const [firstProperty, ...remainingProperties] = properties;
  if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (element.dotDotDotToken) {
        continue;
      }
      const property = element.propertyName
        ? getPropertyNameText(element.propertyName)
        : ts.isIdentifier(element.name)
          ? element.name.text
          : undefined;
      if (property === firstProperty) {
        return bindFactoryPath(element.name, remainingProperties);
      }
    }
    return undefined;
  }

  const element = name.elements[Number(firstProperty)];
  return element && !ts.isOmittedExpression(element) && !element.dotDotDotToken
    ? bindFactoryPath(element.name, remainingProperties)
    : undefined;
}

function hasMatchingHoistedReset(
  hoistedCall: ts.CallExpression,
  factoryNode: ts.Node,
  setter: ts.CallExpression,
  bindings: MockBindingIndex,
  resetPaths: ReadonlySet<string>,
  vitestNamespaces: ReadonlySet<string>,
): boolean {
  const declaration = findHoistedVariableDeclaration(hoistedCall);
  if (!declaration) {
    return false;
  }

  const factoryPathGroups = findPersistentMockFactoryPathGroups(
    factoryNode,
    setter,
    bindings,
    vitestNamespaces,
  );
  return (
    factoryPathGroups.length > 0 &&
    factoryPathGroups.every((factoryPaths) =>
      factoryPaths.some((factoryPath) => {
        const boundPath = bindFactoryPath(declaration.name, factoryPath);
        const resolvedPath = boundPath ? resolveMockAccessPath(boundPath, bindings) : undefined;
        return resolvedPath ? resetPaths.has(mockAccessPathKey(resolvedPath)) : false;
      }),
    )
  );
}

function findHoistedPersistentMockWithoutReset(file: HygieneFile): ts.CallExpression | undefined {
  if (
    !hoistedMockPattern.test(file.source) ||
    !persistentMockImplementationPattern.test(file.source)
  ) {
    return undefined;
  }

  let finding: ts.CallExpression | undefined;
  const vitestNamespaces = findVitestNamespaceImports(file.sourceFile);
  const bindings = findMockBindings(file.sourceFile, vitestNamespaces);
  const { hasGlobalReset, resetPaths } = findHoistedResetCoverage(
    file.sourceFile,
    vitestNamespaces,
    bindings,
  );
  if (hasGlobalReset) {
    return undefined;
  }

  function visit(node: ts.Node) {
    if (finding) {
      return;
    }

    if (isViHoistedCall(node, vitestNamespaces) && node.arguments.length > 0) {
      finding = findEvaluatedPersistentMockSetter(node.arguments[0], {
        enterRootFunction: true,
        followSynchronousCalls: true,
        ignorePersistentMockSetter: (setter) =>
          hasMatchingHoistedReset(
            node,
            node.arguments[0],
            setter,
            bindings,
            resetPaths,
            vitestNamespaces,
          ),
      });
      if (finding) {
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(file.sourceFile);
  return finding;
}

// Boundaries beyond which a synchronous module-load traversal must not pass.
// Constructors are included because they only run when the class is
// instantiated. Class static blocks are NOT included: they execute when the
// class declaration is evaluated (i.e. at module load), so mock setters
// inside them DO leak across tests if not reset.
function isFunctionLikeNode(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

type InvokableFunction = ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression;
type LexicalBinding = InvokableFunction | null;

function isInvokableFunction(node: ts.Node): node is InvokableFunction {
  if (ts.isArrowFunction(node)) {
    return true;
  }
  return (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && !node.asteriskToken;
}

function unwrapExpression(node: ts.Node): ts.Node {
  let current = node;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function getFunctionValue(node: ts.Node | undefined): InvokableFunction | undefined {
  if (!node) {
    return undefined;
  }

  const unwrapped = unwrapExpression(node);
  return isInvokableFunction(unwrapped) ? unwrapped : undefined;
}

function setBinding(
  bindings: Map<string, LexicalBinding>,
  name: ts.BindingName,
  value: InvokableFunction | undefined,
  preserveExisting = false,
) {
  if (ts.isIdentifier(name)) {
    if (preserveExisting && bindings.has(name.text)) {
      return;
    }
    bindings.set(name.text, value ?? null);
    return;
  }

  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      setBinding(bindings, element.name, undefined, preserveExisting);
    }
  }
}

function addVariableBindings(
  bindings: Map<string, LexicalBinding>,
  declarations: readonly ts.VariableDeclaration[],
  {
    preserveUninitialized = false,
    resolveFunctionValues = true,
  }: { preserveUninitialized?: boolean; resolveFunctionValues?: boolean } = {},
) {
  for (const declaration of declarations) {
    const value =
      resolveFunctionValues && ts.isIdentifier(declaration.name)
        ? getFunctionValue(declaration.initializer)
        : undefined;
    // A declaration-only `var name;` performs no assignment and must not
    // erase an earlier initializer for the same function-scoped binding.
    const preserveExisting = preserveUninitialized && declaration.initializer === undefined;
    setBinding(bindings, declaration.name, value, preserveExisting);
  }
}

function addImportBindings(bindings: Map<string, LexicalBinding>, statement: ts.ImportDeclaration) {
  const clause = statement.importClause;
  if (!clause) {
    return;
  }

  if (clause.name) {
    bindings.set(clause.name.text, null);
  }

  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      bindings.set(clause.namedBindings.name.text, null);
    } else {
      for (const element of clause.namedBindings.elements) {
        bindings.set(element.name.text, null);
      }
    }
  }
}

function addStatementBindings(
  bindings: Map<string, LexicalBinding>,
  statements: readonly ts.Statement[],
  {
    includeFunctionScopedVariables,
    resolveFunctionValues = true,
  }: { includeFunctionScopedVariables: boolean; resolveFunctionValues?: boolean },
) {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      const isBlockScoped = (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
      if (includeFunctionScopedVariables || isBlockScoped) {
        addVariableBindings(bindings, statement.declarationList.declarations, {
          preserveUninitialized: !isBlockScoped,
          resolveFunctionValues,
        });
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      bindings.set(statement.name.text, isInvokableFunction(statement) ? statement : null);
    } else if (
      (ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name
    ) {
      bindings.set(statement.name.text, null);
    } else if (ts.isImportDeclaration(statement)) {
      addImportBindings(bindings, statement);
    } else if (ts.isImportEqualsDeclaration(statement)) {
      bindings.set(statement.name.text, null);
    }
  }
}

function addFunctionScopedVariableBindings(
  bindings: Map<string, LexicalBinding>,
  scope: ts.Node,
  resolveFunctionValues: boolean,
) {
  function visit(node: ts.Node, isRoot: boolean) {
    if (
      !isRoot &&
      (isFunctionLikeNode(node) || ts.isClassStaticBlockDeclaration(node) || ts.isModuleBlock(node))
    ) {
      return;
    }

    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0) {
      addVariableBindings(bindings, node.declarations, {
        preserveUninitialized: true,
        resolveFunctionValues,
      });
    }

    ts.forEachChild(node, (child) => visit(child, false));
  }

  visit(scope, true);
}

function getLexicalBindings(
  scope: ts.Node,
  cache: Map<ts.Node, ReadonlyMap<string, LexicalBinding>>,
): ReadonlyMap<string, LexicalBinding> | undefined {
  const cached = cache.get(scope);
  if (cached) {
    return cached;
  }

  const bindings = new Map<string, LexicalBinding>();
  if (ts.isSourceFile(scope)) {
    // Vitest hoists vi.hoisted() callbacks above module variable initialization.
    // Module function declarations are callable there, but function-valued
    // const/let/var declarations are still unavailable (or undefined).
    addStatementBindings(bindings, scope.statements, {
      includeFunctionScopedVariables: true,
      resolveFunctionValues: false,
    });
    addFunctionScopedVariableBindings(bindings, scope, false);
  } else if (ts.isBlock(scope)) {
    const ownsFunctionScopedVariables = ts.isClassStaticBlockDeclaration(scope.parent);
    addStatementBindings(bindings, scope.statements, {
      includeFunctionScopedVariables: ownsFunctionScopedVariables,
    });
    if (ownsFunctionScopedVariables) {
      addFunctionScopedVariableBindings(bindings, scope, true);
    }
  } else if (ts.isModuleBlock(scope)) {
    addStatementBindings(bindings, scope.statements, { includeFunctionScopedVariables: true });
    addFunctionScopedVariableBindings(bindings, scope, true);
  } else if (ts.isCaseBlock(scope)) {
    addStatementBindings(
      bindings,
      scope.clauses.flatMap((clause) => [...clause.statements]),
      { includeFunctionScopedVariables: false },
    );
  } else if (isFunctionLikeNode(scope)) {
    if ((ts.isFunctionDeclaration(scope) || ts.isFunctionExpression(scope)) && scope.name) {
      bindings.set(scope.name.text, scope);
    }
    for (const parameter of scope.parameters) {
      setBinding(bindings, parameter.name, undefined);
    }
    addFunctionScopedVariableBindings(bindings, scope, true);
  } else if (ts.isCatchClause(scope) && scope.variableDeclaration) {
    setBinding(bindings, scope.variableDeclaration.name, undefined);
  } else if (
    (ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) &&
    scope.initializer &&
    ts.isVariableDeclarationList(scope.initializer) &&
    (scope.initializer.flags & ts.NodeFlags.BlockScoped) !== 0
  ) {
    addVariableBindings(bindings, scope.initializer.declarations);
  } else {
    return undefined;
  }

  cache.set(scope, bindings);
  return bindings;
}

function resolveLexicalFunction(
  identifier: ts.Identifier,
  cache: Map<ts.Node, ReadonlyMap<string, LexicalBinding>>,
): InvokableFunction | undefined {
  let scope: ts.Node | undefined = identifier.parent;
  while (scope) {
    const bindings = getLexicalBindings(scope, cache);
    if (bindings?.has(identifier.text)) {
      return bindings.get(identifier.text) ?? undefined;
    }
    scope = scope.parent;
  }
  return undefined;
}

function resolveInvokedFunction(
  node: ts.Node,
  cache: Map<ts.Node, ReadonlyMap<string, LexicalBinding>>,
): InvokableFunction | undefined {
  const unwrapped = unwrapExpression(node);
  if (isInvokableFunction(unwrapped)) {
    return unwrapped;
  }
  if (ts.isIdentifier(unwrapped)) {
    return resolveLexicalFunction(unwrapped, cache);
  }
  return undefined;
}

// Parameter defaults run only when the corresponding value is undefined.
// Literal arguments and binding patterns are modeled exactly; dynamic values,
// spreads, and accessors remain unknown and conservatively explore both paths.
type StaticBindingValue =
  | { kind: 'defined'; expression?: ts.Expression }
  | { kind: 'missing' }
  | { kind: 'unknown' };

const missingBindingValue: StaticBindingValue = { kind: 'missing' };
const unknownBindingValue: StaticBindingValue = { kind: 'unknown' };
const definedBindingValue: StaticBindingValue = { kind: 'defined' };

function isSyntacticUndefined(node: ts.Expression): boolean {
  const unwrapped = unwrapExpression(node);
  return (
    (ts.isIdentifier(unwrapped) && unwrapped.text === 'undefined') || ts.isVoidExpression(unwrapped)
  );
}

function toStaticBindingValue(node: ts.Expression): StaticBindingValue {
  const unwrapped = unwrapExpression(node) as ts.Expression;
  if (isSyntacticUndefined(unwrapped)) {
    return missingBindingValue;
  }
  if (
    ts.isArrayLiteralExpression(unwrapped) ||
    ts.isObjectLiteralExpression(unwrapped) ||
    ts.isArrowFunction(unwrapped) ||
    ts.isFunctionExpression(unwrapped) ||
    ts.isClassExpression(unwrapped) ||
    ts.isNewExpression(unwrapped) ||
    ts.isStringLiteralLike(unwrapped) ||
    ts.isNumericLiteral(unwrapped) ||
    ts.isBigIntLiteral(unwrapped) ||
    ts.isRegularExpressionLiteral(unwrapped) ||
    ts.isTemplateExpression(unwrapped) ||
    unwrapped.kind === ts.SyntaxKind.TrueKeyword ||
    unwrapped.kind === ts.SyntaxKind.FalseKeyword ||
    unwrapped.kind === ts.SyntaxKind.NullKeyword
  ) {
    return { kind: 'defined', expression: unwrapped };
  }
  return unknownBindingValue;
}

function getCallArgument(
  args: readonly ts.Expression[],
  parameterIndex: number,
): StaticBindingValue {
  for (let index = 0; index <= parameterIndex && index < args.length; index += 1) {
    if (ts.isSpreadElement(args[index])) {
      return unknownBindingValue;
    }
  }
  const argument = args[parameterIndex];
  return argument ? toStaticBindingValue(argument) : missingBindingValue;
}

function getPropertyNameText(name: ts.PropertyName | undefined): string | undefined {
  if (!name) {
    return undefined;
  }
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name) ||
    ts.isBigIntLiteral(name)
  ) {
    return name.text;
  }
  if (
    ts.isComputedPropertyName(name) &&
    (ts.isStringLiteralLike(name.expression) || ts.isNumericLiteral(name.expression))
  ) {
    return name.expression.text;
  }
  return undefined;
}

function getObjectBindingValue(
  element: ts.BindingElement,
  value: StaticBindingValue,
): StaticBindingValue {
  if (value.kind !== 'defined' || !value.expression) {
    return value.kind === 'missing' ? missingBindingValue : unknownBindingValue;
  }

  const expression = unwrapExpression(value.expression);
  if (!ts.isObjectLiteralExpression(expression)) {
    return unknownBindingValue;
  }

  const key = getPropertyNameText(
    element.propertyName ?? (ts.isIdentifier(element.name) ? element.name : undefined),
  );
  if (!key) {
    return unknownBindingValue;
  }

  for (let index = expression.properties.length - 1; index >= 0; index -= 1) {
    const property = expression.properties[index];
    if (ts.isSpreadAssignment(property)) {
      return unknownBindingValue;
    }
    const propertyName = getPropertyNameText(property.name);
    if (!propertyName) {
      return unknownBindingValue;
    }
    if (propertyName !== key) {
      continue;
    }
    if (ts.isPropertyAssignment(property)) {
      return toStaticBindingValue(property.initializer);
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      return unknownBindingValue;
    }
    return ts.isMethodDeclaration(property) ? definedBindingValue : unknownBindingValue;
  }

  return missingBindingValue;
}

function getArrayBindingValue(elementIndex: number, value: StaticBindingValue): StaticBindingValue {
  if (value.kind !== 'defined' || !value.expression) {
    return value.kind === 'missing' ? missingBindingValue : unknownBindingValue;
  }

  const expression = unwrapExpression(value.expression);
  if (!ts.isArrayLiteralExpression(expression)) {
    return unknownBindingValue;
  }

  for (let index = 0; index <= elementIndex && index < expression.elements.length; index += 1) {
    if (ts.isSpreadElement(expression.elements[index])) {
      return unknownBindingValue;
    }
  }
  const arrayElement = expression.elements[elementIndex];
  if (!arrayElement || ts.isOmittedExpression(arrayElement)) {
    return missingBindingValue;
  }
  return toStaticBindingValue(arrayElement);
}

function isViMockCall(
  node: ts.Node,
  vitestNamespaces: ReadonlySet<string>,
): node is ts.CallExpression {
  return isViMethodCall(node, 'mock', vitestNamespaces);
}

// Returns the first call ending in a persistent mock setter that `node`
// synchronously evaluates (mockReturnValue/mockResolvedValue/etc). Function
// bodies remain boundaries unless the function is the evaluated root or is a
// directly invoked local function/IIFE. Identifier resolution is deliberately
// lexical and file-local; imported and indirectly aliased functions are not
// followed.
function findEvaluatedPersistentMockSetter(
  node: ts.Node,
  opts: {
    enterRootFunction?: boolean;
    followSynchronousCalls?: boolean;
    ignorePersistentMockSetter?: (setter: ts.CallExpression) => boolean;
  } = {},
): ts.CallExpression | undefined {
  let finding: ts.CallExpression | undefined;
  const activeFunctionBodies = new Set<InvokableFunction>();
  // Function bodies are argument-independent in this bounded traversal, while
  // parameter defaults are evaluated separately for each direct call.
  const completedFunctionBodies = new Set<InvokableFunction>();
  const activeDefaultInitializers = new Set<ts.Expression>();
  const completedDefaultInitializers = new Set<ts.Expression>();
  const bindingCache = new Map<ts.Node, ReadonlyMap<string, LexicalBinding>>();

  function visitDefaultInitializer(initializer: ts.Expression) {
    if (
      finding ||
      activeDefaultInitializers.has(initializer) ||
      completedDefaultInitializers.has(initializer)
    ) {
      return;
    }

    activeDefaultInitializers.add(initializer);
    try {
      visit(initializer);
      completedDefaultInitializers.add(initializer);
    } finally {
      activeDefaultInitializers.delete(initializer);
    }
  }

  function getEffectiveBindingValues(
    initializer: ts.Expression | undefined,
    value: StaticBindingValue,
  ): StaticBindingValue[] {
    if (value.kind === 'defined') {
      return [value];
    }

    const effectiveValues: StaticBindingValue[] = [];
    if (initializer) {
      visitDefaultInitializer(initializer);
      effectiveValues.push(toStaticBindingValue(initializer));
    }
    if (value.kind === 'unknown') {
      effectiveValues.push(unknownBindingValue);
    }
    return effectiveValues;
  }

  function visitObjectBindingElements(
    pattern: ts.ObjectBindingPattern,
    effectiveValues: readonly StaticBindingValue[],
  ) {
    for (const effectiveValue of effectiveValues) {
      for (const element of pattern.elements) {
        const elementValue = element.dotDotDotToken
          ? definedBindingValue
          : getObjectBindingValue(element, effectiveValue);
        visitBindingInitializers(element.name, element.initializer, elementValue);
      }
    }
  }

  function visitArrayBindingElements(
    pattern: ts.ArrayBindingPattern,
    effectiveValues: readonly StaticBindingValue[],
  ) {
    for (const effectiveValue of effectiveValues) {
      for (const [index, element] of pattern.elements.entries()) {
        if (ts.isOmittedExpression(element)) {
          continue;
        }
        const elementValue = element.dotDotDotToken
          ? definedBindingValue
          : getArrayBindingValue(index, effectiveValue);
        visitBindingInitializers(element.name, element.initializer, elementValue);
      }
    }
  }

  function visitBindingInitializers(
    name: ts.BindingName,
    initializer: ts.Expression | undefined,
    value: StaticBindingValue,
  ) {
    if (finding) {
      return;
    }
    if (ts.isIdentifier(name)) {
      if (initializer && value.kind !== 'defined') {
        visitDefaultInitializer(initializer);
      }
      return;
    }

    const effectiveValues = getEffectiveBindingValues(initializer, value);
    if (ts.isObjectBindingPattern(name)) {
      visitObjectBindingElements(name, effectiveValues);
    } else {
      visitArrayBindingElements(name, effectiveValues);
    }
  }

  function visitInvokedFunction(fn: InvokableFunction, args: readonly ts.Expression[]) {
    if (finding) {
      return;
    }

    for (const [index, parameter] of fn.parameters.entries()) {
      visitBindingInitializers(parameter.name, parameter.initializer, getCallArgument(args, index));
    }

    if (finding || activeFunctionBodies.has(fn) || completedFunctionBodies.has(fn) || !fn.body) {
      return;
    }

    activeFunctionBodies.add(fn);
    try {
      visit(fn.body);
      completedFunctionBodies.add(fn);
    } finally {
      activeFunctionBodies.delete(fn);
    }
  }

  function visit(current: ts.Node) {
    if (finding) {
      return;
    }

    // A function body is only evaluated when the call-expression handling
    // below resolves an actual synchronous invocation.
    if (isFunctionLikeNode(current)) {
      return;
    }

    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      persistentMockMethodNames.has(current.expression.name.text)
    ) {
      if (opts.ignorePersistentMockSetter?.(current)) {
        return;
      }
      finding = current;
      return;
    }

    if (opts.followSynchronousCalls && ts.isCallExpression(current)) {
      const invokedFunction = resolveInvokedFunction(current.expression, bindingCache);
      // Callee/argument expressions evaluate before the called function body.
      // Function literals encountered here remain boundaries.
      ts.forEachChild(current, visit);
      if (invokedFunction) {
        visitInvokedFunction(invokedFunction, current.arguments);
      }
      return;
    }

    ts.forEachChild(current, visit);
  }

  if (opts.enterRootFunction) {
    const rootFunction = resolveInvokedFunction(node, bindingCache);
    if (rootFunction) {
      visitInvokedFunction(rootFunction, []);
    } else {
      visit(node);
    }
  } else {
    visit(node);
  }
  return finding;
}

function isSleepNewExpression(node: ts.Node): node is ts.NewExpression {
  if (
    !ts.isNewExpression(node) ||
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== 'Promise' ||
    !node.arguments?.length
  ) {
    return false;
  }
  const executor = node.arguments[0];
  if (!ts.isArrowFunction(executor) && !ts.isFunctionExpression(executor)) {
    return false;
  }
  if (executor.parameters.length === 0) {
    return false;
  }
  const first = executor.parameters[0];
  if (!ts.isIdentifier(first.name)) {
    return false;
  }
  const resolveName = first.name.text;
  let found = false;
  function visit(current: ts.Node) {
    if (found) {
      return;
    }
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === 'setTimeout' &&
      current.arguments.length >= 1 &&
      ts.isIdentifier(current.arguments[0]) &&
      current.arguments[0].text === resolveName
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(executor.body);
  return found;
}

// Build a lookup for module-scope variable / function declarations whose
// value is a function literal, so that `vi.mock('x', factory)` with a factory
// passed by identifier can be resolved back to its body and scanned.
function findModuleFactories(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const moduleFactoryByName = new Map<string, ts.Node>();
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          moduleFactoryByName.set(decl.name.text, decl.initializer);
        }
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      moduleFactoryByName.set(stmt.name.text, stmt);
    }
  }
  return moduleFactoryByName;
}

function resolveModuleFactoryArg(
  arg: ts.Expression,
  moduleFactoryByName: ReadonlyMap<string, ts.Node>,
): ts.Node {
  if (ts.isIdentifier(arg)) {
    const factory = moduleFactoryByName.get(arg.text);
    if (factory) {
      return factory;
    }
  }
  return arg;
}

function findExpressionStatementPersistentMock(
  stmt: ts.Statement,
  moduleFactoryByName: ReadonlyMap<string, ts.Node>,
  vitestNamespaces: ReadonlySet<string>,
): ts.Node | undefined {
  if (!ts.isExpressionStatement(stmt)) {
    return undefined;
  }

  if (!isViMockCall(stmt.expression, vitestNamespaces)) {
    return findEvaluatedPersistentMockSetter(stmt.expression);
  }

  // vi.mock(path, factory): the factory body runs at module load. Resolve
  // identifier-style factories back to their declaration first.
  if (stmt.expression.arguments.length < 2) {
    return undefined;
  }
  const factoryNode = resolveModuleFactoryArg(stmt.expression.arguments[1], moduleFactoryByName);
  return findEvaluatedPersistentMockSetter(factoryNode, { enterRootFunction: true });
}

function findVariableStatementPersistentMock(stmt: ts.Statement): ts.Node | undefined {
  if (!ts.isVariableStatement(stmt)) {
    return undefined;
  }

  for (const declaration of stmt.declarationList.declarations) {
    if (!declaration.initializer) {
      continue;
    }
    const finding = findEvaluatedPersistentMockSetter(declaration.initializer);
    if (finding) {
      return finding;
    }
  }
  return undefined;
}

function findClassStaticBlockPersistentMock(stmt: ts.Statement): ts.Node | undefined {
  if (!ts.isClassDeclaration(stmt)) {
    return undefined;
  }

  // Static blocks execute at module load when the class is evaluated, so any
  // persistent setter inside one leaks across tests.
  for (const member of stmt.members) {
    if (!ts.isClassStaticBlockDeclaration(member)) {
      continue;
    }
    const finding = findEvaluatedPersistentMockSetter(member.body);
    if (finding) {
      return finding;
    }
  }
  return undefined;
}

function findModuleScopePersistentMockWithoutReset(file: HygieneFile): ts.Node | undefined {
  const vitestNamespaces = findVitestNamespaceImports(file.sourceFile);
  if (hasViMethodCall(file.sourceFile, 'resetAllMocks', vitestNamespaces)) {
    return undefined;
  }
  const moduleFactoryByName = findModuleFactories(file.sourceFile);

  for (const stmt of file.sourceFile.statements) {
    const finding =
      findExpressionStatementPersistentMock(stmt, moduleFactoryByName, vitestNamespaces) ??
      findVariableStatementPersistentMock(stmt) ??
      findClassStaticBlockPersistentMock(stmt);
    if (finding) {
      return finding;
    }
  }

  return undefined;
}

function isProcessIdentifier(node: ts.Node): node is ts.Identifier {
  return ts.isIdentifier(node) && node.text === 'process';
}

function isEnvStringLiteral(node: ts.Node): boolean {
  return (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === 'env'
  );
}

function isProcessEnvExpression(
  node: ts.Node,
): node is ts.PropertyAccessExpression | ts.ElementAccessExpression {
  return (
    (ts.isPropertyAccessExpression(node) &&
      node.name.text === 'env' &&
      isProcessIdentifier(node.expression)) ||
    (ts.isElementAccessExpression(node) &&
      isProcessIdentifier(node.expression) &&
      isEnvStringLiteral(node.argumentExpression))
  );
}

function isProcessEnvMemberExpression(
  node: ts.Node,
): node is ts.PropertyAccessExpression | ts.ElementAccessExpression {
  return (
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
    isProcessEnvExpression(node.expression)
  );
}

function containsProcessEnvMutationTarget(node: ts.Node): boolean {
  if (isProcessEnvExpression(node) || isProcessEnvMemberExpression(node)) {
    return true;
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    found ||= containsProcessEnvMutationTarget(child);
  });
  return found;
}

function isProcessEnvMutationCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression) || node.arguments.length === 0) {
    return false;
  }

  const target = node.arguments[0];
  const receiver = node.expression.expression;
  const method = node.expression.name.text;

  return (
    ts.isIdentifier(receiver) &&
    isProcessEnvExpression(target) &&
    ((receiver.text === 'Object' &&
      ['assign', 'defineProperties', 'defineProperty'].includes(method)) ||
      (receiver.text === 'Reflect' && ['defineProperty', 'deleteProperty', 'set'].includes(method)))
  );
}

function isDirectProcessEnvMutationNode(node: ts.Node): boolean {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
    containsProcessEnvMutationTarget(node.left)
  ) {
    return true;
  }

  if (
    ts.isDeleteExpression(node) &&
    (isProcessEnvExpression(node.expression) || isProcessEnvMemberExpression(node.expression))
  ) {
    return true;
  }

  if (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken) &&
    isProcessEnvMemberExpression(node.operand)
  ) {
    return true;
  }

  return ts.isCallExpression(node) && isProcessEnvMutationCall(node);
}

function isSnapshotIdentifier(node: ts.Node): boolean {
  return ts.isIdentifier(node) && processEnvSnapshotIdentifierPattern.test(node.text);
}

function isProcessEnvReferenceSnapshotNode(node: ts.Node): boolean {
  if (
    ts.isVariableDeclaration(node) &&
    isSnapshotIdentifier(node.name) &&
    node.initializer &&
    isProcessEnvExpression(node.initializer)
  ) {
    return true;
  }

  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    isSnapshotIdentifier(node.left) &&
    isProcessEnvExpression(node.right)
  );
}

function findBiomeDirectProcessEnvMutationPluginIncludes(): string[] {
  const source = readFileSync(biomeConfigPath, 'utf8');
  const pluginIndex = source.indexOf(`"${directProcessEnvMutationPluginPath}"`);

  if (pluginIndex === -1) {
    throw new Error('Biome process.env mutation plugin is not configured');
  }

  const includesKeyStart = source.slice(0, pluginIndex).lastIndexOf('"includes": [');
  const includesStart = source.indexOf('[', includesKeyStart);
  const includesEnd = source.indexOf(']', includesStart);

  if (
    includesKeyStart === -1 ||
    includesStart === -1 ||
    includesEnd === -1 ||
    includesEnd > pluginIndex
  ) {
    throw new Error('Biome process.env mutation plugin includes are missing or out of order');
  }

  return Array.from(
    source.slice(includesStart, includesEnd).matchAll(/"([^"]+)"/g),
    ([, glob]) => glob,
  );
}

function isTestControlKind(name: string): name is TestControlKind {
  return name === 'only' || name === 'skip' || name === 'skipIf';
}

function hasTestApiBase(expression: ts.Expression): boolean {
  let current = expression;

  while (true) {
    if (ts.isIdentifier(current)) {
      return testApiNames.has(current.text);
    }

    if (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
      continue;
    }

    if (ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }

    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }

    return false;
  }
}

function findTestControlUsage(
  file: HygieneFile,
  node: ts.Node,
  sourceLines: readonly string[],
): TestControlUsage | undefined {
  if (
    !ts.isPropertyAccessExpression(node) ||
    !isTestControlKind(node.name.text) ||
    !hasTestApiBase(node.expression)
  ) {
    return undefined;
  }

  const start = node.getStart(file.sourceFile);
  const position = file.sourceFile.getLineAndCharacterOfPosition(start);
  const fullLineText = sourceLines[position.line] ?? '';
  const trimmedLineText = fullLineText.trim();
  const expression = node.getText(file.sourceFile).replace(/\s+/g, ' ');
  const diagnostic = createDiagnostic(file, {
    ruleId: 'test-control',
    start,
    message: `${node.name.text} is not allowed`,
    snippet: trimmedLineText || expression,
  });

  return {
    ...diagnostic,
    expression,
    kind: node.name.text,
    trimmedLineText,
  };
}

function formatUsage(usage: TestControlUsage) {
  return formatDiagnostic(usage);
}

function isAllowedSkip(usage: TestControlUsage) {
  return allowedSkippedTests.some(
    (allowed) =>
      allowed.file === usage.file &&
      allowed.kind === usage.kind &&
      allowed.linePattern.test(usage.trimmedLineText),
  );
}

type SyntaxPolicyResults = {
  directProcessEnvMutation?: ts.Node;
  processEnvReferenceSnapshot?: ts.Node;
  sleepPromise?: ts.NewExpression;
  testControlUsages: TestControlUsage[];
};

function scanSyntaxPolicies(file: HygieneFile): SyntaxPolicyResults {
  const results: SyntaxPolicyResults = { testControlUsages: [] };
  const sourceLines = file.source.split(/\r?\n/);

  function visit(node: ts.Node) {
    const testControlUsage = findTestControlUsage(file, node, sourceLines);
    if (testControlUsage) {
      results.testControlUsages.push(testControlUsage);
    }
    if (!results.directProcessEnvMutation && isDirectProcessEnvMutationNode(node)) {
      results.directProcessEnvMutation = node;
    }
    if (!results.processEnvReferenceSnapshot && isProcessEnvReferenceSnapshotNode(node)) {
      results.processEnvReferenceSnapshot = node;
    }
    if (!results.sleepPromise && isSleepNewExpression(node)) {
      results.sleepPromise = node;
    }

    ts.forEachChild(node, visit);
  }

  visit(file.sourceFile);
  return results;
}

type FilePolicyResults = {
  directProcessEnvMutation: HygieneDiagnostic[];
  hoistedPersistentMock: HygieneDiagnostic[];
  moduleScopePersistentMock: HygieneDiagnostic[];
  processEnvReferenceSnapshot: HygieneDiagnostic[];
  sleepPromise: HygieneDiagnostic[];
  testControlUsages: TestControlUsage[];
};

type RootPolicyResults = FilePolicyResults & {
  scanSummary: HygieneScanSummary;
};

function createEmptyPolicyResults(): FilePolicyResults {
  return {
    directProcessEnvMutation: [],
    hoistedPersistentMock: [],
    moduleScopePersistentMock: [],
    processEnvReferenceSnapshot: [],
    sleepPromise: [],
    testControlUsages: [],
  };
}

function addPolicyDiagnostic(
  diagnostics: HygieneDiagnostic[],
  file: HygieneFile,
  finding: ts.Node | undefined,
  ruleId: string,
  message: string,
) {
  if (!finding) {
    return;
  }

  diagnostics.push(
    createDiagnostic(file, {
      ruleId,
      start: finding.getStart(file.sourceFile),
      message,
      snippet: finding.getText(file.sourceFile),
    }),
  );
}

function scanFilePolicies(file: HygieneFile): FilePolicyResults {
  const results = createEmptyPolicyResults();
  const syntaxResults = scanSyntaxPolicies(file);
  results.testControlUsages.push(...syntaxResults.testControlUsages);
  addPolicyDiagnostic(
    results.hoistedPersistentMock,
    file,
    findHoistedPersistentMockWithoutReset(file),
    'hoisted-persistent-mock-reset',
    'hoisted mocks with persistent implementations must reset implementations with mockReset() or vi.resetAllMocks()',
  );
  addPolicyDiagnostic(
    results.directProcessEnvMutation,
    file,
    syntaxResults.directProcessEnvMutation,
    'direct-process-env-mutation',
    'use mockProcessEnv() or vi.stubEnv() instead of direct process.env mutation',
  );
  addPolicyDiagnostic(
    results.processEnvReferenceSnapshot,
    file,
    syntaxResults.processEnvReferenceSnapshot,
    'process-env-reference-snapshot',
    'snapshot process.env with { ...process.env } instead of by reference',
  );
  addPolicyDiagnostic(
    results.sleepPromise,
    file,
    syntaxResults.sleepPromise,
    'set-timeout-sleep-wait',
    "replace 'await new Promise(r => setTimeout(r, ms))' with vi.useFakeTimers() + vi.runAllTimersAsync(), or testing-library waitFor()",
  );
  addPolicyDiagnostic(
    results.moduleScopePersistentMock,
    file,
    findModuleScopePersistentMockWithoutReset(file),
    'module-scope-persistent-mock-reset',
    'module-scope persistent mock setters (mockReturnValue/mockResolvedValue/etc) must be paired with mockReset() or vi.resetAllMocks() in beforeEach to survive random test order',
  );
  return results;
}

function appendPolicyResults(target: FilePolicyResults, source: FilePolicyResults) {
  target.directProcessEnvMutation.push(...source.directProcessEnvMutation);
  target.hoistedPersistentMock.push(...source.hoistedPersistentMock);
  target.moduleScopePersistentMock.push(...source.moduleScopePersistentMock);
  target.processEnvReferenceSnapshot.push(...source.processEnvReferenceSnapshot);
  target.sleepPromise.push(...source.sleepPromise);
  target.testControlUsages.push(...source.testControlUsages);
}

function sortPolicyResults(results: FilePolicyResults): FilePolicyResults {
  return {
    directProcessEnvMutation: sortDiagnostics(results.directProcessEnvMutation),
    hoistedPersistentMock: sortDiagnostics(results.hoistedPersistentMock),
    moduleScopePersistentMock: sortDiagnostics(results.moduleScopePersistentMock),
    processEnvReferenceSnapshot: sortDiagnostics(results.processEnvReferenceSnapshot),
    sleepPromise: sortDiagnostics(results.sleepPromise),
    testControlUsages: [...results.testControlUsages].sort(compareDiagnostics),
  };
}

function scanRootTestPolicies(): RootPolicyResults {
  const results = createEmptyPolicyResults();
  const scanSummary = scanHygieneFiles({
    rootDir: testDir,
    excludeFiles: [thisFile],
    scanFile(file) {
      appendPolicyResults(results, scanFilePolicies(file));
    },
  });

  return {
    ...sortPolicyResults(results),
    scanSummary,
  };
}

function scanFixturePolicies(source: string, file = 'fixture.test.ts'): FilePolicyResults {
  return scanFilePolicies(createHygieneFile({ file, source }));
}

function findTestControlUsages(file: string, source: string): TestControlUsage[] {
  return scanFixturePolicies(source, file).testControlUsages;
}

function hasHoistedPersistentMockWithoutReset(source: string): boolean {
  return scanFixturePolicies(source).hoistedPersistentMock.length > 0;
}

function hasDirectProcessEnvMutation(source: string): boolean {
  return scanFixturePolicies(source).directProcessEnvMutation.length > 0;
}

function hasProcessEnvReferenceSnapshot(source: string): boolean {
  return scanFixturePolicies(source).processEnvReferenceSnapshot.length > 0;
}

function hasSleepPromise(source: string): boolean {
  return scanFixturePolicies(source).sleepPromise.length > 0;
}

function hasModuleScopePersistentMockWithoutReset(source: string): boolean {
  return scanFixturePolicies(source).moduleScopePersistentMock.length > 0;
}

const rootPolicyResults = scanRootTestPolicies();

describe('root test hygiene', () => {
  const rootUsages = rootPolicyResults.testControlUsages;

  it('accounts for every discovered file in the streaming scan', () => {
    expect(rootPolicyResults.scanSummary.excludedFiles).toBe(1);
    expect(
      rootPolicyResults.scanSummary.scannedFiles +
        rootPolicyResults.scanSummary.excludedFiles +
        rootPolicyResults.scanSummary.missingFiles,
    ).toBe(rootPolicyResults.scanSummary.discoveredFiles);
  });

  it.each([
    ['describe.only("suite", () => {})', 'only', 'describe.only'],
    ['test.concurrent.only("case", () => {})', 'only', 'test.concurrent.only'],
    ['test.each([1]).only("case", () => {})', 'only', 'test.each([1]).only'],
    ['it.skip("case", () => {})', 'skip', 'it.skip'],
    ['const maybeIt = condition ? it : it.skip;', 'skip', 'it.skip'],
    ['it.skipIf(process.platform === "win32")("case", () => {})', 'skipIf', 'it.skipIf'],
  ])('detects committed test control source in %s', (source, kind, expression) => {
    expect(findTestControlUsages('fixture.test.ts', source)).toMatchObject([
      {
        expression,
        kind,
      },
    ]);
  });

  it('ignores test control text inside verifier fixtures and comments', () => {
    const source = [
      '// describe.only("not executable", () => {})',
      'const patch = `test.skip("auth validation", () => {})`;',
      'fs.writeFileSync(path, "it.skip(\\\"case\\\", () => {})");',
    ].join('\n');

    expect(findTestControlUsages('fixture.test.ts', source)).toEqual([]);
  });

  it('does not commit focused root tests', () => {
    const focusedUsages = rootUsages.filter((usage) => usage.kind === 'only').map(formatUsage);

    expect(focusedUsages).toEqual([]);
  });

  it('keeps root skipped tests explicit and allowlisted', () => {
    const unapprovedSkips = rootUsages
      .filter((usage) => usage.kind !== 'only')
      .filter((usage) => !isAllowedSkip(usage))
      .map(formatUsage);

    expect(unapprovedSkips).toEqual([]);
  });

  it('keeps the root skip allowlist scoped to active skips', () => {
    const skippedUsages = rootUsages.filter((usage) => usage.kind !== 'only');
    const staleAllowlistEntries = allowedSkippedTests
      .filter(
        (allowed) =>
          !skippedUsages.some(
            (usage) =>
              usage.file === allowed.file &&
              usage.kind === allowed.kind &&
              allowed.linePattern.test(usage.trimmedLineText),
          ),
      )
      .map((allowed) => `${allowed.file}: ${allowed.kind} allowlist is stale: ${allowed.reason}`);

    expect(staleAllowlistEntries).toEqual([]);
  });

  it.each([
    [
      'direct setter control',
      [
        'const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
        'beforeEach(() => {',
        '  vi.clearAllMocks();',
        '});',
      ].join('\n'),
    ],
    [
      'object setter control',
      [
        'const mockClient = vi.hoisted(() => ({',
        '  connect: vi.fn().mockImplementation(() => undefined),',
        '}));',
      ].join('\n'),
    ],
    [
      'callback identifier control',
      [
        'function factory() { return vi.fn().mockReturnValue("default"); }',
        'const mockClient = vi.hoisted(factory);',
      ].join('\n'),
    ],
    [
      'immediately invoked arrow expression',
      "const mock = vi.hoisted(() => (() => vi.fn().mockReturnValue('x'))());",
    ],
    [
      'module-scope function declaration',
      [
        "function build() { return vi.fn().mockReturnValue('x'); }",
        'const mock = vi.hoisted(() => build());',
      ].join('\n'),
    ],
    [
      'namespace-qualified vi.hoisted call',
      [
        "import * as vitest from 'vitest';",
        "const mock = vitest.vi.hoisted(() => vitest.vi.fn().mockReturnValue('x'));",
      ].join('\n'),
    ],
    [
      'callback-local function declaration',
      [
        'const mock = vi.hoisted(() => {',
        "  function build() { return vi.fn().mockReturnValue('x'); }",
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'callback-local function-valued variable',
      [
        'const mock = vi.hoisted(() => {',
        "  const build = () => vi.fn().mockReturnValue('x');",
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'object binding defaults',
      [
        "function build({ value = vi.fn().mockReturnValue('x') }) { return value; }",
        'const mock = vi.hoisted(() => build({}));',
      ].join('\n'),
    ],
    [
      'array binding defaults',
      [
        "function build([value = vi.fn().mockReturnValue('x')]) { return value; }",
        'const mock = vi.hoisted(() => build([]));',
      ].join('\n'),
    ],
    [
      'a default activated after an earlier supplied call',
      [
        "function build(value = vi.fn().mockReturnValue('x')) { return value; }",
        'const mock = vi.hoisted(() => {',
        "  build('safe');",
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'an object binding default behind an unknown computed property',
      [
        'const mock = vi.hoisted(() => {',
        "  const key = 'value';",
        "  function build({ value = vi.fn().mockReturnValue('x') }) { return value; }",
        '  return build({ [key]: undefined });',
        '});',
      ].join('\n'),
    ],
    [
      'declaration-only var redeclarations',
      [
        'const mock = vi.hoisted(() => {',
        "  var build = () => vi.fn().mockReturnValue('x');",
        '  var build;',
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'switch-scoped helpers',
      [
        'const mock = vi.hoisted(() => {',
        "  switch ('unsafe') {",
        "    case 'unsafe':",
        "      const build = () => vi.fn().mockReturnValue('x');",
        '      return build();',
        '  }',
        '});',
      ].join('\n'),
    ],
    [
      'class-static-block helpers',
      [
        'const mock = vi.hoisted(() => {',
        '  class Factory {',
        '    static {',
        "      var build = () => vi.fn().mockReturnValue('x');",
        '      build();',
        '    }',
        '  }',
        '  return vi.fn();',
        '});',
      ].join('\n'),
    ],
  ])('detects hoisted persistent mock implementations through %s', (_case, source) => {
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it.each([
    [
      [
        'const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
        'beforeEach(() => {',
        '  mockRequest.mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
        'beforeEach(() => {',
        '  vi.resetAllMocks();',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        '  request: vi.fn().mockResolvedValue({ ok: true }),',
        '}));',
        'beforeEach(() => {',
        '  mocks.request.mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        "  first: vi.fn().mockReturnValue('first'),",
        "  second: vi.fn().mockReturnValue('second'),",
        '}));',
        'const { first, second } = mocks;',
        'beforeEach(() => {',
        "  first.mockReset().mockReturnValue('first');",
        "  second.mockReset().mockReturnValue('second');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        '  request: vi.fn().mockResolvedValue({ ok: true }),',
        '}));',
        'beforeEach(() => {',
        "  mocks['request'].mockReset().mockResolvedValue({ ok: true });",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        '  request: vi.fn().mockResolvedValue({ ok: true }),',
        '}));',
        'const { request } = mocks;',
        'beforeEach(() => {',
        '  request.mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        '  request: vi.fn().mockResolvedValue({ ok: true }),',
        '}));',
        'const request = mocks.request;',
        'beforeEach(() => {',
        '  request.mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
        'beforeEach(() => {',
        '  vi.mocked(mockRequest).mockReset().mockResolvedValue({ ok: true });',
        '});',
      ].join('\n'),
    ],
    [
      [
        "import * as vitest from 'vitest';",
        'const mockRequest = vitest.vi.hoisted(() =>',
        '  vitest.vi.fn().mockResolvedValue({ ok: true }),',
        ');',
        'beforeEach(() => {',
        '  vitest.vi.resetAllMocks();',
        '});',
      ].join('\n'),
    ],
    [
      [
        "function build() { return vi.fn().mockReturnValue('default'); }",
        'const mock = vi.hoisted(() => build());',
        'beforeEach(() => {',
        "  mock.mockReset().mockReturnValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        "function build() { return vi.fn().mockReturnValue('default'); }",
        'const mocks = vi.hoisted(() => ({ safe: build(), unsafe: build() }));',
        'beforeEach(() => {',
        "  mocks.safe.mockReset().mockReturnValue('default');",
        "  mocks.unsafe.mockReset().mockReturnValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        "function build() { return vi.fn().mockReturnValue('default'); }",
        'const mocks = vi.hoisted(() => {',
        '  const shared = build();',
        '  return { first: shared, second: shared };',
        '});',
        'beforeEach(() => {',
        "  mocks.first.mockReset().mockReturnValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => {',
        "  const request = vi.fn().mockReturnValue('default');",
        '  const client = { request };',
        '  return { client };',
        '});',
        'const client = mocks.client;',
        'beforeEach(() => {',
        "  client.request.mockReset().mockReturnValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => {',
        '  const request = vi.fn();',
        "  request.mockResolvedValue('default');",
        '  return { request };',
        '});',
        'beforeEach(() => {',
        "  mocks.request.mockReset().mockResolvedValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => {',
        '  const client = { request: vi.fn() };',
        "  client.request.mockResolvedValue('default');",
        '  return { client };',
        '});',
        'beforeEach(() => {',
        "  mocks.client.request.mockReset().mockResolvedValue('default');",
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mocks = vi.hoisted(() => ({',
        "  request: vi.fn().mockReturnValue('default'),",
        '}));',
        'const { request } = mocks;',
        'beforeEach(() => {',
        "  request.mockReset().mockReturnValue('default');",
        '});',
        "it('uses another request', () => {",
        '  const request = otherClient.request;',
        '  expect(request).toBeDefined();',
        '});',
      ].join('\n'),
    ],
  ])('allows hoisted persistent mock implementations with reset', (source) => {
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it('does not let a reset on a scoped shadow cover a hoisted mock', () => {
    const source = [
      'const mocks = vi.hoisted(() => ({',
      "  request: vi.fn().mockReturnValue('default'),",
      '}));',
      'const { request } = mocks;',
      'beforeEach(() => {',
      '  const request = otherClient.request;',
      '  request.mockReset();',
      '});',
    ].join('\n');

    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('does not let a reset on a parameter shadow cover a hoisted mock', () => {
    const source = [
      "const request = vi.hoisted(() => vi.fn().mockReturnValue('default'));",
      'function resetRequest(request: ReturnType<typeof vi.fn>) {',
      '  request.mockReset();',
      '}',
    ].join('\n');

    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('does not let one per-mock reset hide another hoisted violation', () => {
    const source = [
      "const safe = vi.hoisted(() => vi.fn().mockReturnValue('safe'));",
      "const unsafe = vi.hoisted(() => vi.fn().mockReturnValue('unsafe'));",
      'beforeEach(() => {',
      "  safe.mockReset().mockReturnValue('safe');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 2,
        snippet: "vi.fn().mockReturnValue('unsafe')",
      }),
    ]);
  });

  it('does not let one property reset hide a sibling hoisted mock', () => {
    const source = [
      'const mocks = vi.hoisted(() => ({',
      "  safe: vi.fn().mockReturnValue('safe'),",
      "  unsafe: vi.fn().mockReturnValue('unsafe'),",
      '}));',
      'beforeEach(() => {',
      "  mocks.safe.mockReset().mockReturnValue('safe');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 3,
        snippet: "vi.fn().mockReturnValue('unsafe')",
      }),
    ]);
  });

  it('requires every mock produced by repeated helper calls to be reset', () => {
    const source = [
      "function build() { return vi.fn().mockReturnValue('default'); }",
      'const mocks = vi.hoisted(() => ({ safe: build(), unsafe: build() }));',
      'beforeEach(() => {',
      "  mocks.safe.mockReset().mockReturnValue('default');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 1,
        snippet: "vi.fn().mockReturnValue('default')",
      }),
    ]);
  });

  it('does not let a side-effect reset hide a sibling hoisted mock', () => {
    const source = [
      'const mocks = vi.hoisted(() => {',
      '  const safe = vi.fn();',
      "  safe.mockReturnValue('safe');",
      '  const unsafe = vi.fn();',
      "  unsafe.mockReturnValue('unsafe');",
      '  return { safe, unsafe };',
      '});',
      'beforeEach(() => {',
      "  mocks.safe.mockReset().mockReturnValue('safe');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 5,
        snippet: "unsafe.mockReturnValue('unsafe')",
      }),
    ]);
  });

  it('does not treat a dynamic property reset as specific mock coverage', () => {
    const source = [
      "const key = 'request';",
      'const mocks = vi.hoisted(() => ({',
      "  request: vi.fn().mockReturnValue('default'),",
      '}));',
      'beforeEach(() => {',
      '  mocks[key].mockReset();',
      '});',
    ].join('\n');

    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(true);
  });

  it('tracks nested returned mocks through local aliases', () => {
    const source = [
      'const mocks = vi.hoisted(() => {',
      '  const client = {',
      "    safe: vi.fn().mockReturnValue('safe'),",
      "    unsafe: vi.fn().mockReturnValue('unsafe'),",
      '  };',
      '  return { client };',
      '});',
      'const client = mocks.client;',
      'beforeEach(() => {',
      "  client.safe.mockReset().mockReturnValue('safe');",
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 4,
        snippet: "vi.fn().mockReturnValue('unsafe')",
      }),
    ]);
  });

  it.each([
    [
      'an uninvoked helper returned from the callback',
      [
        'const mock = vi.hoisted(() => {',
        "  const build = () => vi.fn().mockReturnValue('x');",
        '  return build;',
        '});',
      ].join('\n'),
    ],
    [
      'a helper passed through another synchronous helper',
      [
        'const mock = vi.hoisted(() => {',
        "  const build = () => vi.fn().mockReturnValue('x');",
        '  function pass(callback: () => unknown) { return callback; }',
        '  return pass(build);',
        '});',
      ].join('\n'),
    ],
    [
      'a scheduled callback',
      [
        'const mock = vi.hoisted(() => {',
        "  const build = () => vi.fn().mockReturnValue('x');",
        '  setTimeout(build, 0);',
        '  return vi.fn();',
        '});',
      ].join('\n'),
    ],
    [
      'an inline deferred callback',
      [
        'const mock = vi.hoisted(() => {',
        "  setTimeout(() => vi.fn().mockReturnValue('x'), 0);",
        '  return vi.fn();',
        '});',
      ].join('\n'),
    ],
    [
      'a safe local helper shadowing an unsafe module helper',
      [
        "function build() { return vi.fn().mockReturnValue('x'); }",
        'const mock = vi.hoisted(() => {',
        '  const build = () => vi.fn();',
        '  return build();',
        '});',
      ].join('\n'),
    ],
    [
      'recursive and cyclic helper references',
      [
        'const mock = vi.hoisted(() => {',
        "  const unused = () => vi.fn().mockReturnValue('x');",
        '  function first(depth: number): unknown {',
        '    return depth === 0 ? vi.fn() : second(depth - 1);',
        '  }',
        '  function second(depth: number): unknown {',
        '    return depth === 0 ? vi.fn() : first(depth - 1);',
        '  }',
        '  return first(1);',
        '});',
      ].join('\n'),
    ],
    [
      'an imported helper',
      [
        "import { build } from './helper';",
        "const unused = () => vi.fn().mockReturnValue('x');",
        'const mock = vi.hoisted(() => build());',
      ].join('\n'),
    ],
    [
      'a generator helper whose body has not started',
      [
        'function* build() {',
        "  return vi.fn().mockReturnValue('x');",
        '}',
        'const mock = vi.hoisted(() => build());',
      ].join('\n'),
    ],
    [
      'a module-scope function-valued variable unavailable during Vitest hoisting',
      [
        "const build = () => vi.fn().mockReturnValue('x');",
        'const mock = vi.hoisted(() => build());',
      ].join('\n'),
    ],
    [
      'a module-scope function-valued callback unavailable during Vitest hoisting',
      [
        "const factory = () => vi.fn().mockReturnValue('x');",
        'const mock = vi.hoisted(factory);',
      ].join('\n'),
    ],
  ])('preserves deferred function boundaries for %s', (_case, source) => {
    expect(scanFixturePolicies(source).hoistedPersistentMock).toEqual([]);
  });

  it.each([
    [
      'a supplied object-binding value',
      [
        "function build({ value = vi.fn().mockReturnValue('x') }) { return value; }",
        "const mock = vi.hoisted(() => build({ value: 'safe' }));",
      ].join('\n'),
    ],
    [
      'a supplied array-binding value',
      [
        "function build([value = vi.fn().mockReturnValue('x')]) { return value; }",
        "const mock = vi.hoisted(() => build(['safe']));",
      ].join('\n'),
    ],
    [
      'a safe switch-scoped helper shadowing an unsafe outer helper',
      [
        "function build() { return vi.fn().mockReturnValue('x'); }",
        'const mock = vi.hoisted(() => {',
        "  switch ('safe') {",
        "    case 'safe':",
        '      const build = () => vi.fn();',
        '      return build();',
        '  }',
        '});',
      ].join('\n'),
    ],
    [
      'a class-static-block var shadowing a safe callback var',
      [
        'const mock = vi.hoisted(() => {',
        '  var build = () => vi.fn();',
        '  class Factory {',
        '    static {',
        "      var build = () => vi.fn().mockReturnValue('x');",
        '    }',
        '  }',
        '  return build();',
        '});',
      ].join('\n'),
    ],
  ])('does not report a persistent setter that cannot execute through %s', (_case, source) => {
    expect(scanFixturePolicies(source).hoistedPersistentMock).toEqual([]);
  });

  it('bounds repeated synchronous helper expansion', () => {
    const helperDepth = 24;
    const helpers = ['function build0() { return vi.fn(); }'];
    for (let depth = 1; depth <= helperDepth; depth += 1) {
      helpers.push(
        `function build${depth}(flag: boolean) { return flag ? build${depth - 1}(flag) : build${depth - 1}(flag); }`,
      );
    }
    const source = [...helpers, `const mock = vi.hoisted(() => build${helperDepth}(true));`].join(
      '\n',
    );

    expect(scanFixturePolicies(source).hoistedPersistentMock).toEqual([]);
  });

  it('anchors multi-hoist diagnostics to the persistent setter in the violating callback', () => {
    const source = [
      'const safe = vi.hoisted(() => vi.fn());',
      'const unsafe = vi.hoisted(() =>',
      '  vi.fn().mockResolvedValue({ ok: true }),',
      ');',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      {
        ruleId: 'hoisted-persistent-mock-reset',
        file: 'nested/fixture.test.ts',
        line: 3,
        column: 3,
        message:
          'hoisted mocks with persistent implementations must reset implementations with mockReset() or vi.resetAllMocks()',
        snippet: 'vi.fn().mockResolvedValue({ ok: true })',
      },
    ]);
  });

  it('anchors a multi-hoist helper diagnostic to the invoked helper setter', () => {
    const source = [
      'const safe = vi.hoisted(() => vi.fn());',
      'function buildUnsafe() {',
      "  return vi.fn().mockReturnValue('x');",
      '}',
      'const unsafe = vi.hoisted(() => buildUnsafe());',
    ].join('\n');

    expect(scanFixturePolicies(source, 'nested/fixture.test.ts').hoistedPersistentMock).toEqual([
      expect.objectContaining({
        file: 'nested/fixture.test.ts',
        line: 3,
        column: 10,
        snippet: "vi.fn().mockReturnValue('x')",
      }),
    ]);
  });

  it('routes fixture predicates through the production per-file policy scanner', () => {
    const source = [
      'describe.only("focused", () => {});',
      'const hoisted = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
      'process.env.API_KEY = "test";',
      'const originalEnv = process.env;',
      'await new Promise((resolve) => setTimeout(resolve, 10));',
      'const persistent = vi.fn().mockReturnValue("default");',
    ].join('\n');
    const policies = scanFixturePolicies(source);

    expect(findTestControlUsages('fixture.test.ts', source)).toEqual(policies.testControlUsages);
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(
      policies.hoistedPersistentMock.length > 0,
    );
    expect(hasDirectProcessEnvMutation(source)).toBe(policies.directProcessEnvMutation.length > 0);
    expect(hasProcessEnvReferenceSnapshot(source)).toBe(
      policies.processEnvReferenceSnapshot.length > 0,
    );
    expect(hasSleepPromise(source)).toBe(policies.sleepPromise.length > 0);
    expect(hasModuleScopePersistentMockWithoutReset(source)).toBe(
      policies.moduleScopePersistentMock.length > 0,
    );
  });

  it.each([
    'process.env.OPENAI_API_KEY = "test-key";',
    'process.env.OPENAI_API_KEY += "-suffix";',
    'process.env.OPENAI_API_KEY ||= "test-key";',
    'process.env["OPENAI_API_KEY"] = "test-key";',
    'process.env["OPENAI_API_KEY"] ??= "test-key";',
    'process.env[key] &&= "test-key";',
    'process["env"].OPENAI_API_KEY = "test-key";',
    'process["env"]["OPENAI_API_KEY"] = "test-key";',
    'process.env.OPENAI_API_KEY++;',
    '++process.env["OPENAI_API_KEY"];',
    'delete process.env.OPENAI_API_KEY;',
    'delete process.env["OPENAI_API_KEY"];',
    'delete process["env"].OPENAI_API_KEY;',
    'delete process.env;',
    'process.env = { ...process.env, OPENAI_API_KEY: "test-key" };',
    'Object.assign(process.env, { OPENAI_API_KEY: "test-key" });',
    'Object.assign(process["env"], { OPENAI_API_KEY: "test-key" });',
    'Object.defineProperty(process.env, "OPENAI_API_KEY", { value: "test-key" });',
    'Object.defineProperties(process.env, { OPENAI_API_KEY: { value: "test-key" } });',
    'Reflect.defineProperty(process.env, "OPENAI_API_KEY", { value: "test-key" });',
    'Reflect.deleteProperty(process.env, "OPENAI_API_KEY");',
    'Reflect.set(process.env, "OPENAI_API_KEY", "test-key");',
  ])('detects direct process.env mutation in %s', (source) => {
    expect(hasDirectProcessEnvMutation(source)).toBe(true);
  });

  it.each([
    'const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: "test-key" });',
    'vi.stubEnv("OPENAI_API_KEY", "test-key");',
    'const env = { ...process.env, NO_COLOR: "1" };',
    'const current = process.env[key];',
    'const current = process["env"][key];',
    'if (process.env.OPENAI_API_KEY === "test-key") {}',
    'Object.assign(env, { OPENAI_API_KEY: "test-key" });',
    'Reflect.set(env, "OPENAI_API_KEY", "test-key");',
    '// process.env.OPENAI_API_KEY = "test-key";',
  ])('allows scoped or read-only environment handling in %s', (source) => {
    expect(hasDirectProcessEnvMutation(source)).toBe(false);
  });

  it.each([
    'const originalEnv = process.env;',
    'const originalEnv = process["env"];',
    'originalEnv = process.env;',
    'const ORIGINAL_ENV = process.env;',
  ])('detects process.env reference snapshots in %s', (source) => {
    expect(hasProcessEnvReferenceSnapshot(source)).toBe(true);
  });

  it.each([
    'const originalEnv = { ...process.env };',
    'const originalApiKey = process.env.OPENAI_API_KEY;',
    'const envReference = process.env;',
    '// const originalEnv = process.env;',
  ])('allows copied snapshots or read-only env access in %s', (source) => {
    expect(hasProcessEnvReferenceSnapshot(source)).toBe(false);
  });

  it('keeps new root tests from adding hoisted persistent mocks without reset', () => {
    const unapprovedFiles = rootPolicyResults.hoistedPersistentMock
      .filter((diagnostic) => !legacyHoistedPersistentMockFiles.has(diagnostic.file))
      .map(formatDiagnostic);

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps the legacy hoisted mock allowlist scoped to active violations', () => {
    const activeFiles = new Set(
      rootPolicyResults.hoistedPersistentMock.map((diagnostic) => diagnostic.file),
    );
    const staleFiles = Array.from(legacyHoistedPersistentMockFiles)
      .filter((file) => !activeFiles.has(file))
      .sort();

    expect(staleFiles).toEqual([]);
  });

  it('keeps new root tests from adding direct process.env mutations', () => {
    const unapprovedFiles = rootPolicyResults.directProcessEnvMutation
      .filter((diagnostic) => !legacyDirectProcessEnvMutationFiles.has(diagnostic.file))
      .map(formatDiagnostic);

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps new root tests from snapshotting process.env by reference', () => {
    const unapprovedFiles = rootPolicyResults.processEnvReferenceSnapshot.map(formatDiagnostic);

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps the legacy process.env mutation allowlist scoped to active violations', () => {
    const activeFiles = new Set(
      rootPolicyResults.directProcessEnvMutation.map((diagnostic) => diagnostic.file),
    );
    const staleFiles = Array.from(legacyDirectProcessEnvMutationFiles)
      .filter((file) => !activeFiles.has(file))
      .sort();

    expect(staleFiles).toEqual([]);
  });

  it('applies the Biome process.env mutation rule to repo TypeScript and JavaScript files', () => {
    expect(findBiomeDirectProcessEnvMutationPluginIncludes()).toEqual(
      directProcessEnvMutationPluginIncludes,
    );
  });

  it.each([
    'await new Promise((resolve) => setTimeout(resolve, 100));',
    'await new Promise((r) => setTimeout(r, 250));',
    'await new Promise(function (resolve) { setTimeout(resolve, 1000); });',
    'await new Promise((resolve) => { setTimeout(resolve, 50); });',
  ])('detects setTimeout-based sleep waits in %s', (source) => {
    expect(hasSleepPromise(source)).toBe(true);
  });

  it.each([
    'await vi.runAllTimersAsync();',
    'vi.advanceTimersByTime(1000);',
    'await waitFor(() => expect(mock).toHaveBeenCalled());',
    'setTimeout(() => callback(), 100);',
    'await new Promise((resolve) => fetcher.on("done", resolve));',
    'const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));',
  ])('allows non-sleep timer usage in %s', (source) => {
    // The last sample defines a helper but does not call it; we still flag
    // helper definitions because the helper itself is a sleep wait. Exclude it
    // from the false-positive set by checking the precondition independently.
    if (source.includes('const sleep = (ms')) {
      expect(hasSleepPromise(source)).toBe(true);
      return;
    }
    expect(hasSleepPromise(source)).toBe(false);
  });

  it('keeps new root tests from adding setTimeout-based sleep waits', () => {
    const unapprovedFiles = rootPolicyResults.sleepPromise
      .filter((diagnostic) => !legacySleepPromiseFiles.has(diagnostic.file))
      .map(formatDiagnostic);

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps the legacy sleep-wait allowlist scoped to active violations', () => {
    const activeFiles = new Set(
      rootPolicyResults.sleepPromise.map((diagnostic) => diagnostic.file),
    );
    const staleFiles = Array.from(legacySleepPromiseFiles)
      .filter((file) => !activeFiles.has(file))
      .sort();

    expect(staleFiles).toEqual([]);
  });

  it.each([
    [
      [
        "vi.mock('proxy-agent', () => ({",
        '  ProxyAgent: vi.fn().mockImplementation(function () {}),',
        '}));',
      ].join('\n'),
    ],
    [
      [
        "vi.mock('node-fetch', () => ({",
        '  default: vi.fn().mockResolvedValue({ json: () => ({ ok: true }) }),',
        '}));',
      ].join('\n'),
    ],
    ['const baseClient = vi.fn().mockReturnValue({ id: "default" });'],
    ['vi.mocked(client).mockResolvedValue({ ok: true });'],
    // Static blocks execute when the class declaration is evaluated (module
    // load), so persistent setters inside them DO leak across tests.
    [
      [
        'class Helper {',
        '  static fn: ReturnType<typeof vi.fn>;',
        '  static {',
        '    Helper.fn = vi.fn().mockReturnValue("x");',
        '  }',
        '}',
      ].join('\n'),
    ],
    // vi.mock(path, factory) where the factory is passed by identifier — the
    // factory body still runs at module load and must be scanned.
    [
      [
        "const factory = () => ({ fn: vi.fn().mockReturnValue('default') });",
        "vi.mock('foo', factory);",
      ].join('\n'),
    ],
    [
      [
        'function makeMockModule() {',
        "  return { fn: vi.fn().mockReturnValue('default') };",
        '}',
        "vi.mock('foo', makeMockModule);",
      ].join('\n'),
    ],
    [
      [
        "import * as vitest from 'vitest';",
        "vitest.vi.mock('foo', () => ({",
        "  fn: vitest.vi.fn().mockReturnValue('default'),",
        '}));',
      ].join('\n'),
    ],
    [
      [
        "import * as vitest from 'vitest';",
        "const factory = () => ({ fn: vitest.vi.fn().mockReturnValue('default') });",
        "vitest.vi.mock('foo', factory);",
      ].join('\n'),
    ],
  ])('detects module-scope persistent mock implementations without reset in %#', (source) => {
    expect(hasModuleScopePersistentMockWithoutReset(source)).toBe(true);
  });

  it.each([
    [
      [
        "vi.mock('proxy-agent', () => ({",
        '  ProxyAgent: vi.fn().mockImplementation(function () {}),',
        '}));',
        '',
        'beforeEach(() => {',
        '  vi.resetAllMocks();',
        '});',
      ].join('\n'),
    ],
    [
      [
        "import * as vitest from 'vitest';",
        "vitest.vi.mock('proxy-agent', () => ({",
        "  ProxyAgent: vitest.vi.fn().mockReturnValue('default'),",
        '}));',
        '',
        'beforeEach(() => {',
        '  vitest.vi.resetAllMocks();',
        '});',
      ].join('\n'),
    ],
    [
      [
        "vi.mock('proxy-agent', () => ({",
        '  ProxyAgent: vi.fn(),',
        '}));',
        '',
        'it("uses the proxy", () => {',
        '  vi.mocked(ProxyAgent).mockReturnValue({});',
        '});',
      ].join('\n'),
    ],
    [['beforeEach(() => {', '  const mock = vi.fn().mockReturnValue("ok");', '});'].join('\n')],
    // Module-scope helpers that aren't called at module load are deferred —
    // their persistent setters do not actually run until the helper is invoked.
    [
      [
        'const buildMock = () => vi.fn().mockReturnValue("default");',
        'beforeEach(() => {',
        '  const local = buildMock();',
        '});',
      ].join('\n'),
    ],
    [
      ['function setupMock() {', '  return vi.fn().mockResolvedValue({ ok: true });', '}'].join(
        '\n',
      ),
    ],
    // Setters inside a class constructor do not run at module load — they
    // only fire when the class is instantiated.
    [
      [
        'class Helper {',
        '  fn: ReturnType<typeof vi.fn>;',
        '  constructor() {',
        '    this.fn = vi.fn().mockReturnValue("x");',
        '  }',
        '}',
      ].join('\n'),
    ],
  ])('allows module-scope persistent mocks when paired with reset or scoped per-test in %#', (source) => {
    expect(hasModuleScopePersistentMockWithoutReset(source)).toBe(false);
  });

  it('treats vi.restoreAllMocks() as insufficient for module-scope vi.fn() defaults', () => {
    // vi.restoreAllMocks() is documented as targeting vi.spyOn mocks; relying
    // on it to reset persistent vi.fn().mockReturnValue(...) defaults is
    // fragile, so the file should still be flagged.
    const source = [
      "vi.mock('foo', () => ({ bar: vi.fn().mockReturnValue('default') }));",
      'afterEach(() => {',
      '  vi.restoreAllMocks();',
      '});',
    ].join('\n');
    expect(hasModuleScopePersistentMockWithoutReset(source)).toBe(true);
  });

  it('treats per-mock .mockReset() as insufficient at file level', () => {
    // A single .mockReset() on one mock does not protect other module-scope
    // persistent setters from leaking — the file should still be flagged.
    const source = [
      "vi.mock('foo', () => ({",
      "  bar: vi.fn().mockReturnValue('bar-default'),",
      "  baz: vi.fn().mockReturnValue('baz-default'),",
      '}));',
      '',
      'beforeEach(() => {',
      '  vi.mocked(bar).mockReset();',
      '});',
    ].join('\n');
    expect(hasModuleScopePersistentMockWithoutReset(source)).toBe(true);
  });

  it('keeps new root tests from adding unreset module-scope persistent mocks', () => {
    const unapprovedFiles = rootPolicyResults.moduleScopePersistentMock
      .filter((diagnostic) => !legacyModuleScopePersistentMockFiles.has(diagnostic.file))
      .map(formatDiagnostic);

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps the legacy module-scope persistent mock allowlist scoped to active violations', () => {
    const activeFiles = new Set(
      rootPolicyResults.moduleScopePersistentMock.map((diagnostic) => diagnostic.file),
    );
    const staleFiles = Array.from(legacyModuleScopePersistentMockFiles)
      .filter((file) => !activeFiles.has(file))
      .sort();

    expect(staleFiles).toEqual([]);
  });
});
