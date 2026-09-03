import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type CallExpression, type Expression, type Node, visitorKeys } from 'oxc-parser';
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
import {
  findHoistedPersistentMockWithoutReset,
  persistentMockMethodNames,
} from './hygiene/hoistedMocks';

type TestControlKind = 'only' | 'skip' | 'skipIf';

type TestControlUsage = HygieneDiagnostic & {
  expression: string;
  kind: TestControlKind;
  fullLineText: string;
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

// Only `vi.resetAllMocks()` is trusted as a file-level signal that every
// `vi.fn()`-style mock has its persistent implementation reset between tests.
// Per-mock helpers (.mockReset()/.mockRestore()) only reset the specific mock
// they are called on, and `vi.restoreAllMocks()` is documented as targeting
// `vi.spyOn` mocks specifically — relying on it to reset module-scope
// `vi.fn().mockReturnValue(...)` defaults is fragile, so it does not count.
// See https://vitest.dev/api/vi#vi-restoreallmocks.
const globalMockResetPattern = /\bvi\.resetAllMocks\s*\(/;
const processEnvSnapshotIdentifierPattern = /^original[A-Za-z0-9_]*$/i;

function forEachChild(node: Node, callback: (child: Node) => void): void {
  const properties = node as unknown as Record<string, unknown>;

  for (const key of visitorKeys[node.type] ?? []) {
    const children = properties[key];
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child) {
          callback(child as Node);
        }
      }
    } else if (children) {
      callback(children as Node);
    }
  }
}

// Boundaries beyond which a synchronous module-load traversal must not pass.
// Constructors are included because they only run when the class is
// instantiated. Class static blocks are NOT included: they execute when the
// class declaration is evaluated (i.e. at module load), so mock setters
// inside them DO leak across tests if not reset.
function isFunctionLikeNode(node: Node): boolean {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'MethodDefinition' ||
    node.type === 'TSAbstractMethodDefinition'
  );
}

function isViCall(node: CallExpression, method: string, namespaces: ReadonlySet<string>): boolean {
  if (
    node.callee.type !== 'MemberExpression' ||
    node.callee.computed ||
    node.callee.property.type !== 'Identifier' ||
    node.callee.property.name !== method
  ) {
    return false;
  }
  const receiver = node.callee.object;
  return (
    (receiver.type === 'Identifier' && receiver.name === 'vi') ||
    (receiver.type === 'MemberExpression' &&
      !receiver.computed &&
      receiver.property.type === 'Identifier' &&
      receiver.property.name === 'vi' &&
      receiver.object.type === 'Identifier' &&
      namespaces.has(receiver.object.name))
  );
}

function isPersistentMockSetter(node: Node): boolean {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    persistentMockMethodNames.has(node.callee.property.name)
  );
}

// A vi.mock factory runs at module load; other function bodies are deferred.
function findPersistentMockSetter(
  node: Node,
  opts: { enterRootFunction?: boolean } = {},
): Node | undefined {
  let found: Node | undefined;
  function visit(current: Node, isRoot: boolean) {
    if (found || (isFunctionLikeNode(current) && !(isRoot && opts.enterRootFunction))) {
      return;
    }
    if (isPersistentMockSetter(current)) {
      found = current;
      return;
    }
    forEachChild(current, (child) => visit(child, false));
  }
  visit(node, true);
  return found;
}

function isSleepNewExpression(node: Node): boolean {
  if (
    node.type !== 'NewExpression' ||
    node.callee.type !== 'Identifier' ||
    node.callee.name !== 'Promise' ||
    node.arguments.length === 0
  ) {
    return false;
  }
  const executor = node.arguments[0];
  if (executor.type !== 'ArrowFunctionExpression' && executor.type !== 'FunctionExpression') {
    return false;
  }
  if (executor.params.length === 0 || !executor.body) {
    return false;
  }
  const parameter = executor.params[0];
  const first = parameter.type === 'AssignmentPattern' ? parameter.left : parameter;
  if (first.type !== 'Identifier') {
    return false;
  }
  const resolveName = first.name;
  let inner = false;
  function visit(node: Node) {
    if (inner) {
      return;
    }
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'setTimeout' &&
      node.arguments.length >= 1 &&
      node.arguments[0].type === 'Identifier' &&
      node.arguments[0].name === resolveName
    ) {
      inner = true;
      return;
    }
    forEachChild(node, visit);
  }
  visit(executor.body);
  return inner;
}

function findModuleMockFactories(statements: Node[]): Map<string, Node> {
  const factories = new Map<string, Node>();

  for (const statement of statements) {
    const stmt =
      (statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration') &&
      statement.declaration
        ? statement.declaration
        : statement;
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        if (
          decl.id.type === 'Identifier' &&
          decl.init &&
          (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression')
        ) {
          factories.set(decl.id.name, decl.init);
        }
      }
    } else if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      factories.set(stmt.id.name, stmt);
    }
  }

  return factories;
}

function findModuleScopePersistentSetter(
  statement: Node,
  factories: Map<string, Node>,
  namespaces: ReadonlySet<string>,
): Node | undefined {
  if (statement.type === 'ExpressionStatement') {
    const expression =
      statement.expression.type === 'ChainExpression'
        ? statement.expression.expression
        : statement.expression;
    if (expression.type !== 'CallExpression' || !isViCall(expression, 'mock', namespaces)) {
      return findPersistentMockSetter(expression);
    }
    const factory = expression.arguments[1];
    if (!factory) {
      return undefined;
    }
    const resolvedFactory =
      factory.type === 'Identifier' ? (factories.get(factory.name) ?? factory) : factory;
    return findPersistentMockSetter(resolvedFactory, { enterRootFunction: true });
  }

  if (statement.type === 'VariableDeclaration') {
    for (const declaration of statement.declarations) {
      const found = declaration.init ? findPersistentMockSetter(declaration.init) : undefined;
      if (found) {
        return found;
      }
    }
  }

  if (statement.type === 'ClassDeclaration') {
    for (const member of statement.body.body) {
      const found = member.type === 'StaticBlock' ? findPersistentMockSetter(member) : undefined;
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function findModuleScopePersistentMockWithoutReset(file: HygieneFile): Node | undefined {
  if (globalMockResetPattern.test(file.source)) {
    return undefined;
  }

  const statements = file.sourceFile.body.map((statement) =>
    (statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration') &&
    statement.declaration
      ? statement.declaration
      : statement,
  );
  const factories = findModuleMockFactories(statements);
  const namespaces = new Set(
    file.sourceFile.body.flatMap((statement) =>
      statement.type === 'ImportDeclaration' && statement.source.value === 'vitest'
        ? statement.specifiers
            .filter((specifier) => specifier.type === 'ImportNamespaceSpecifier')
            .map((specifier) => specifier.local.name)
        : [],
    ),
  );
  for (const statement of statements) {
    const found = findModuleScopePersistentSetter(statement, factories, namespaces);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function isEnvStringLiteral(node: Node): boolean {
  return (
    (node.type === 'Literal' && node.value === 'env') ||
    (node.type === 'TemplateLiteral' &&
      node.expressions.length === 0 &&
      node.quasis[0]?.value.cooked === 'env')
  );
}

function isProcessEnvExpression(node: Node): boolean {
  const expression = node.type === 'ChainExpression' ? node.expression : node;
  return (
    expression.type === 'MemberExpression' &&
    expression.object.type === 'Identifier' &&
    expression.object.name === 'process' &&
    ((!expression.computed &&
      expression.property.type === 'Identifier' &&
      expression.property.name === 'env') ||
      (expression.computed && isEnvStringLiteral(expression.property)))
  );
}

function isProcessEnvMemberExpression(node: Node): boolean {
  const expression = node.type === 'ChainExpression' ? node.expression : node;
  return expression.type === 'MemberExpression' && isProcessEnvExpression(expression.object);
}

function containsProcessEnvMutationTarget(node: Node): boolean {
  if (isProcessEnvExpression(node) || isProcessEnvMemberExpression(node)) {
    return true;
  }

  let found = false;
  forEachChild(node, (child) => {
    found ||= containsProcessEnvMutationTarget(child);
  });
  return found;
}

function isProcessEnvMutationCall(node: CallExpression): boolean {
  if (
    node.callee.type !== 'MemberExpression' ||
    node.callee.computed ||
    node.callee.property.type !== 'Identifier' ||
    node.arguments.length === 0
  ) {
    return false;
  }

  const target = node.arguments[0];
  const receiver = node.callee.object;
  const method = node.callee.property.name;

  return (
    receiver.type === 'Identifier' &&
    isProcessEnvExpression(target) &&
    ((receiver.name === 'Object' &&
      ['assign', 'defineProperties', 'defineProperty'].includes(method)) ||
      (receiver.name === 'Reflect' && ['defineProperty', 'deleteProperty', 'set'].includes(method)))
  );
}

function isDirectProcessEnvMutationNode(node: Node): boolean {
  return (
    (node.type === 'AssignmentExpression' && containsProcessEnvMutationTarget(node.left)) ||
    (node.type === 'UnaryExpression' &&
      node.operator === 'delete' &&
      (isProcessEnvExpression(node.argument) || isProcessEnvMemberExpression(node.argument))) ||
    (node.type === 'UpdateExpression' && isProcessEnvMemberExpression(node.argument)) ||
    (node.type === 'CallExpression' && isProcessEnvMutationCall(node))
  );
}

function isProcessEnvReferenceSnapshotNode(node: Node): boolean {
  function isSnapshotIdentifier(identifier: Node): boolean {
    return (
      identifier.type === 'Identifier' && processEnvSnapshotIdentifierPattern.test(identifier.name)
    );
  }
  return (
    (node.type === 'VariableDeclarator' &&
      isSnapshotIdentifier(node.id) &&
      node.init !== null &&
      isProcessEnvExpression(node.init)) ||
    (node.type === 'AssignmentExpression' &&
      node.operator === '=' &&
      isSnapshotIdentifier(node.left) &&
      isProcessEnvExpression(node.right))
  );
}

// Only files seen in the root scan can keep an allowlist entry active. This
// avoids extra reads and cannot follow an absolute or out-of-root allowlist path.
function findStalePolicyAllowlistFiles(
  allowlist: ReadonlySet<string>,
  diagnostics: readonly HygieneDiagnostic[],
): string[] {
  const activeFiles = new Set(diagnostics.map((diagnostic) => diagnostic.file));
  return [...allowlist].filter((file) => !activeFiles.has(file)).sort();
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

function hasTestApiBase(expression: Expression, names = testApiNames): boolean {
  let current: Node = expression;

  while (true) {
    if (current.type === 'Identifier') {
      return names.has(current.name);
    }

    if (current.type === 'MemberExpression') {
      current = current.object;
      continue;
    }

    if (current.type === 'CallExpression') {
      current = current.callee;
      continue;
    }

    if (current.type === 'ParenthesizedExpression' || current.type === 'ChainExpression') {
      current = current.expression;
      continue;
    }

    return false;
  }
}

function findTestControlUsage(
  file: HygieneFile,
  node: Node,
  sourceLines: string[],
): TestControlUsage | undefined {
  if (
    node.type !== 'MemberExpression' ||
    node.computed ||
    node.property.type !== 'Identifier' ||
    !isTestControlKind(node.property.name) ||
    !hasTestApiBase(node.object)
  ) {
    return undefined;
  }

  const expression = file.source.slice(node.start, node.end).replace(/\s+/g, ' ');
  const diagnostic = createDiagnostic(file, {
    ruleId: 'test-control',
    start: node.start,
    message: `${node.property.name} is not allowed`,
    snippet: expression,
  });
  const fullLineText = sourceLines[diagnostic.line - 1] ?? '';
  const trimmedLineText = fullLineText.trim();
  return {
    ...diagnostic,
    expression,
    kind: node.property.name,
    fullLineText,
    trimmedLineText,
  };
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
  directProcessEnvMutation?: Node;
  processEnvReferenceSnapshot?: Node;
  sleepPromise?: Node;
  testControlUsages: TestControlUsage[];
};

function scanSyntaxPolicies(file: HygieneFile): SyntaxPolicyResults {
  const results: SyntaxPolicyResults = { testControlUsages: [] };
  const sourceLines = file.source.split(/\r?\n/);
  function visit(node: Node) {
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
    forEachChild(node, visit);
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
  finding: Node | undefined,
  ruleId: string,
  message: string,
) {
  if (!finding) {
    return;
  }

  diagnostics.push(
    createDiagnostic(file, {
      ruleId,
      start: finding.start,
      message,
      snippet: file.source.slice(finding.start, finding.end),
    }),
  );
}

function scanFilePolicies(file: HygieneFile): FilePolicyResults {
  const results = createEmptyPolicyResults();
  const syntaxResults = scanSyntaxPolicies(file);
  results.testControlUsages.push(...syntaxResults.testControlUsages);
  const hoistedViolation = findHoistedPersistentMockWithoutReset(file);
  if (hoistedViolation) {
    results.hoistedPersistentMock.push(hoistedViolation);
  }
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
  it.each([false, true])(
    'checks namespace-qualified module mocks with global reset=%s',
    (reset) => {
      const source = [
        "import * as vitest from 'vitest';",
        "vitest.vi.mock('dependency', () => ({ request: vitest.vi.fn().mockReturnValue('default') }));",
        ...(reset ? ['beforeEach(() => vitest.vi.resetAllMocks());'] : []),
      ].join('\n');
      expect(hasModuleScopePersistentMockWithoutReset(source)).toBe(!reset);
    },
  );

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

  it('preserves test-control source locations after Unicode text', () => {
    const source = '// 😀 café\n  it.skip("case", () => {});';

    expect(findTestControlUsages('fixture.test.ts', source)).toMatchObject([
      {
        column: 3,
        expression: 'it.skip',
        fullLineText: '  it.skip("case", () => {});',
        line: 2,
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
    const focusedUsages = rootUsages.filter((usage) => usage.kind === 'only').map(formatDiagnostic);

    expect(focusedUsages).toEqual([]);
  });

  it('keeps root skipped tests explicit and allowlisted', () => {
    const unapprovedSkips = rootUsages
      .filter((usage) => usage.kind !== 'only')
      .filter((usage) => !isAllowedSkip(usage))
      .map(formatDiagnostic);

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
      [
        'const mockRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));',
        'beforeEach(() => {',
        '  vi.clearAllMocks();',
        '});',
      ].join('\n'),
    ],
    [
      [
        'const mockClient = vi.hoisted(() => ({',
        '  connect: vi.fn().mockImplementation(() => undefined),',
        '}));',
      ].join('\n'),
    ],
  ])('detects hoisted persistent mock implementations without reset', (source) => {
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
  ])('allows hoisted persistent mock implementations with reset', (source) => {
    expect(hasHoistedPersistentMockWithoutReset(source)).toBe(false);
  });

  it('detects collection-time defaults installed on hoisted mocks', () => {
    const source = [
      'const mock = vi.hoisted(() => vi.fn());',
      'describe("suite", () => {',
      '  mock.mockReturnValue("default");',
      '  it("case", () => {});',
      '});',
    ].join('\n');

    expect(scanFixturePolicies(source).hoistedPersistentMock).toMatchObject([
      { line: 3, column: 3, snippet: 'mock.mockReturnValue("default")' },
    ]);
  });

  it.each([
    {
      source: [
        'it("safe", () => vi.fn().mockReturnValue("safe"));',
        'beforeEach(() => vi.fn().mockReturnValue("safe"));',
        'const mock = vi.hoisted(() => vi.fn().mockReturnValue("unsafe"));',
      ].join('\n'),
      line: 3,
      snippet: 'vi.fn().mockReturnValue("unsafe")',
    },
    {
      source: [
        'it("safe", () => vi.fn().mockReturnValue("safe"));',
        'const mock = vi.hoisted(() => vi.fn());',
        'describe.each([1])("suite", () => {',
        '  mock.mockReturnValue("unsafe");',
        '});',
      ].join('\n'),
      line: 4,
      snippet: 'mock.mockReturnValue("unsafe")',
    },
    {
      source: [
        'it("safe", () => vi.fn().mockReturnValue("safe"));',
        'const factory = () => vi.fn().mockReturnValue("unsafe");',
        'const mock = vi.hoisted(factory);',
      ].join('\n'),
      line: 2,
      snippet: 'vi.fn().mockReturnValue("unsafe")',
    },
  ])(
    'does not anchor hoisted diagnostics to a per-test setter in $source',
    ({ source, line, snippet }) => {
      expect(scanFixturePolicies(source).hoistedPersistentMock).toMatchObject([{ line, snippet }]);
    },
  );

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
    'delete process.env?.OPENAI_API_KEY;',
    'delete process?.env?.OPENAI_API_KEY;',
    'delete process["env"].OPENAI_API_KEY;',
    'delete process.env;',
    'process.env = { ...process.env, OPENAI_API_KEY: "test-key" };',
    'Object.assign(process.env, { OPENAI_API_KEY: "test-key" });',
    'Object.assign(process?.env, { OPENAI_API_KEY: "test-key" });',
    'Object.assign(process["env"], { OPENAI_API_KEY: "test-key" });',
    'Object.defineProperty(process.env, "OPENAI_API_KEY", { value: "test-key" });',
    'Object.defineProperties(process.env, { OPENAI_API_KEY: { value: "test-key" } });',
    'Reflect.defineProperty(process.env, "OPENAI_API_KEY", { value: "test-key" });',
    'Reflect.deleteProperty(process.env, "OPENAI_API_KEY");',
    'Reflect.set(process.env, "OPENAI_API_KEY", "test-key");',
    'pr\\u006fcess.env.OPENAI_API_KEY = "test-key";',
    'process.\\u0065nv.OPENAI_API_KEY = "test-key";',
    'process["\\x65nv"].OPENAI_API_KEY = "test-key";',
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
    'const originalEnv = process?.env;',
    'const originalEnv = process?.["env"];',
    'const originalEnv = process["env"];',
    'originalEnv = process.env;',
    'const ORIGINAL_ENV = process.env;',
    'const originalEnv = pr\\u006fcess.env;',
    'const originalEnv = process["\\x65nv"];',
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
      .filter(
        (diagnostic) =>
          diagnostic.ruleId !== 'hoisted-persistent-mock-reset' ||
          !legacyHoistedPersistentMockFiles.has(diagnostic.file),
      )
      .map(formatDiagnostic);

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps the legacy hoisted mock allowlist scoped to active violations', () => {
    const staleFiles = findStalePolicyAllowlistFiles(
      legacyHoistedPersistentMockFiles,
      rootPolicyResults.hoistedPersistentMock.filter(
        (diagnostic) => diagnostic.ruleId === 'hoisted-persistent-mock-reset',
      ),
    );

    expect(staleFiles).toEqual([]);
  });

  it('keeps only scanned violations active in policy allowlists', () => {
    const diagnostics = scanFixturePolicies(
      'process.env.API_KEY = "test";',
      'database.test.ts',
    ).directProcessEnvMutation;
    expect(
      findStalePolicyAllowlistFiles(
        new Set(['database.test.ts', 'missing-policy-allowlist.test.ts']),
        diagnostics,
      ),
    ).toEqual(['missing-policy-allowlist.test.ts']);
    expect(findStalePolicyAllowlistFiles(new Set(['database.test.ts']), [])).toEqual([
      'database.test.ts',
    ]);
  });

  it('rejects out-of-root and noncanonical allowlist paths without reading them', () => {
    const invalidFiles = [
      '../src/app/src/stores/redteamJobStore.test.ts',
      path.join(repoRoot, 'src/app/src/stores/redteamJobStore.test.ts'),
      './database.test.ts',
      'nested/../database.test.ts',
      'test-hygiene.test.ts',
    ];
    const diagnostics = scanFixturePolicies(
      'process.env.API_KEY = "test";',
      'database.test.ts',
    ).directProcessEnvMutation;

    expect(findStalePolicyAllowlistFiles(new Set(invalidFiles), diagnostics)).toEqual(
      [...invalidFiles].sort(),
    );
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
    const staleFiles = findStalePolicyAllowlistFiles(
      legacyDirectProcessEnvMutationFiles,
      rootPolicyResults.directProcessEnvMutation,
    );

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
    'await new Promise((resolve = fallback) => setTimeout(resolve, 100));',
    'await new Pro\\u006dise((resolve) => setTi\\u006deout(resolve, 100));',
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
    const staleFiles = findStalePolicyAllowlistFiles(
      legacySleepPromiseFiles,
      rootPolicyResults.sleepPromise,
    );

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
    ['export const baseClient = vi.fn().mockReturnValue({ id: "default" });'],
    ['vi.mocked(client).mockResolvedValue({ ok: true });'],
    ["vi?.mock('foo', () => ({ fn: vi.fn().mockReturnValue('default') }));"],
    ["vi.mock?.('foo', () => ({ fn: vi.fn().mockReturnValue('default') }));"],
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
        "export const factory = () => ({ fn: vi.fn().mockReturnValue('default') });",
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
        'export function makeMockModule() {',
        "  return { fn: vi.fn().mockReturnValue('default') };",
        '}',
        "vi.mock('foo', makeMockModule);",
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
  ])(
    'allows module-scope persistent mocks when paired with reset or scoped per-test in %#',
    (source) => {
      expect(hasModuleScopePersistentMockWithoutReset(source)).toBe(false);
    },
  );

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
    const staleFiles = findStalePolicyAllowlistFiles(
      legacyModuleScopePersistentMockFiles,
      rootPolicyResults.moduleScopePersistentMock,
    );

    expect(staleFiles).toEqual([]);
  });
});
