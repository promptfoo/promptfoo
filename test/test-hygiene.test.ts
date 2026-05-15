import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type TestControlKind = 'only' | 'skip' | 'skipIf';

type TestControlUsage = {
  column: number;
  expression: string;
  file: string;
  kind: TestControlKind;
  line: number;
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
const testFilePattern = /\.(?:test|spec)\.(?:ts|tsx)$/;
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
    file: 'redteam/plugins/codingAgent.test.ts',
    kind: 'skipIf',
    linePattern: /^it\.skipIf\(process\.platform === 'win32'\)\($/,
    reason: 'Host-side unreadable-file sandbox coverage depends on Unix permissions',
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
  'providers/functionCallbackUtils.test.ts',
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
  'redteam/commands/report.test.ts',
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
  'tracing/evaluatorTracing.test.ts',
  'tracing/integration.test.ts',
  'util/agent/fsOperations.test.ts',
  'util/config/load.test.ts',
  'util/jsonExport.test.ts',
  'util/jsonlOutput.test.ts',
  'util/sanitizer.test.ts',
  'util/testCaseReader.test.ts',
  'util/transform.test.ts',
  'validators/testProvider.test.ts',
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
const mockImplementationResetPattern = /(?:\.mockReset\s*\(|\bvi\.resetAllMocks\s*\()/;
// Only `vi.resetAllMocks()` is trusted as a file-level signal that every
// `vi.fn()`-style mock has its persistent implementation reset between tests.
// Per-mock helpers (.mockReset()/.mockRestore()) only reset the specific mock
// they are called on, and `vi.restoreAllMocks()` is documented as targeting
// `vi.spyOn` mocks specifically — relying on it to reset module-scope
// `vi.fn().mockReturnValue(...)` defaults is fragile, so it does not count.
// See https://vitest.dev/api/vi#vi-restoreallmocks.
const globalMockResetPattern = /\bvi\.resetAllMocks\s*\(/;
const processEnvSnapshotIdentifierPattern = /^original[A-Za-z0-9_]*$/i;

function findTestFiles(dir: string): string[] {
  // Use withFileTypes so entry type comes from the directory record itself rather
  // than a follow-up stat() call. Other test files (e.g. python/workerPool.test.ts)
  // create and delete fixtures in beforeAll/afterAll, and parallel test execution
  // can delete an entry between readdir() and stat(), causing a flaky ENOENT.
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return findTestFiles(fullPath);
    }

    return testFilePattern.test(fullPath) ? [fullPath] : [];
  });
}

function findRootTestFiles(): string[] {
  return findTestFiles(testDir).filter((file) => file !== thisFile);
}

function toPosixRelativePath(file: string) {
  return path.relative(testDir, file).replace(/\\/g, '/');
}

function hasHoistedPersistentMockWithoutReset(source: string) {
  return (
    hoistedMockPattern.test(source) &&
    persistentMockImplementationPattern.test(source) &&
    !mockImplementationResetPattern.test(source)
  );
}

// Boundaries beyond which a synchronous module-load traversal must not pass.
// Constructors are included because they only run when the class is
// instantiated. Class static blocks are NOT included: they execute when the
// class declaration is evaluated (i.e. at module load), so mock setters
// inside them DO leak across tests if not reset.
function isFunctionLikeNode(node: ts.Node): boolean {
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

function isViMockCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'vi' &&
    node.expression.name.text === 'mock'
  );
}

// True if `node` synchronously evaluates a call ending in a persistent mock
// setter (mockReturnValue/mockResolvedValue/etc). Skips bodies of function
// literals — both nested and at the root — since those only run when the
// callback fires. Pass `enterRootFunction: true` for the body of a vi.mock(...)
// factory, which IS executed synchronously at module load.
function evaluatesPersistentMockSetter(
  node: ts.Node,
  opts: { enterRootFunction?: boolean } = {},
): boolean {
  let found = false;
  function visit(current: ts.Node, isRoot: boolean) {
    if (found) {
      return;
    }
    // Stop at function literal boundaries — their bodies don't run at module
    // load. Exception: when `enterRootFunction` is set, descend into the root
    // node itself (used for vi.mock(..., factory) factories).
    if (isFunctionLikeNode(current) && !(isRoot && opts.enterRootFunction)) {
      return;
    }
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      persistentMockMethodNames.has(current.expression.name.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, (child) => visit(child, false));
  }
  visit(node, true);
  return found;
}

function hasSleepPromise(source: string) {
  const sourceFile = ts.createSourceFile('fixture.test.ts', source, ts.ScriptTarget.Latest, true);
  let found = false;

  function isSleepNewExpression(node: ts.Node): boolean {
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
    let inner = false;
    function visit(node: ts.Node) {
      if (inner) {
        return;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'setTimeout' &&
        node.arguments.length >= 1 &&
        ts.isIdentifier(node.arguments[0]) &&
        node.arguments[0].text === resolveName
      ) {
        inner = true;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(executor.body);
    return inner;
  }

  function visit(node: ts.Node) {
    if (found) {
      return;
    }
    if (isSleepNewExpression(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasModuleScopePersistentMockWithoutReset(source: string) {
  if (globalMockResetPattern.test(source)) {
    return false;
  }
  const sourceFile = ts.createSourceFile('fixture.test.ts', source, ts.ScriptTarget.Latest, true);

  // Build a lookup for module-scope variable / function declarations whose
  // value is a function literal, so that `vi.mock('x', factory)` with a
  // factory passed by identifier can be resolved back to its body and scanned.
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

  function resolveViMockFactoryArg(arg: ts.Expression): ts.Node {
    if (ts.isIdentifier(arg) && moduleFactoryByName.has(arg.text)) {
      return moduleFactoryByName.get(arg.text) as ts.Node;
    }
    return arg;
  }

  for (const stmt of sourceFile.statements) {
    if (ts.isExpressionStatement(stmt)) {
      if (ts.isCallExpression(stmt.expression) && isViMockCall(stmt.expression)) {
        // vi.mock(path, factory): the factory body runs at module load. Resolve
        // identifier-style factories back to their declaration first.
        if (stmt.expression.arguments.length >= 2) {
          const factoryNode = resolveViMockFactoryArg(stmt.expression.arguments[1]);
          if (evaluatesPersistentMockSetter(factoryNode, { enterRootFunction: true })) {
            return true;
          }
        }
        continue;
      }
      if (evaluatesPersistentMockSetter(stmt.expression)) {
        return true;
      }
    }
    if (
      ts.isVariableStatement(stmt) &&
      stmt.declarationList.declarations.some(
        (decl) => decl.initializer && evaluatesPersistentMockSetter(decl.initializer),
      )
    ) {
      return true;
    }
    // Class declarations: static blocks execute at module load when the class
    // is evaluated, so any persistent setter inside one leaks across tests.
    if (ts.isClassDeclaration(stmt)) {
      for (const member of stmt.members) {
        if (
          ts.isClassStaticBlockDeclaration(member) &&
          evaluatesPersistentMockSetter(member.body)
        ) {
          return true;
        }
      }
    }
  }

  return false;
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

function hasDirectProcessEnvMutation(source: string) {
  const sourceFile = ts.createSourceFile('fixture.test.ts', source, ts.ScriptTarget.Latest, true);
  let found = false;

  function visit(node: ts.Node) {
    if (found) {
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      containsProcessEnvMutationTarget(node.left)
    ) {
      found = true;
      return;
    }

    if (
      ts.isDeleteExpression(node) &&
      (isProcessEnvExpression(node.expression) || isProcessEnvMemberExpression(node.expression))
    ) {
      found = true;
      return;
    }

    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      isProcessEnvMemberExpression(node.operand)
    ) {
      found = true;
      return;
    }

    if (ts.isCallExpression(node) && isProcessEnvMutationCall(node)) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function hasProcessEnvReferenceSnapshot(source: string) {
  const sourceFile = ts.createSourceFile('fixture.test.ts', source, ts.ScriptTarget.Latest, true);
  let found = false;

  function isSnapshotIdentifier(node: ts.Node): boolean {
    return ts.isIdentifier(node) && processEnvSnapshotIdentifierPattern.test(node.text);
  }

  function visit(node: ts.Node) {
    if (found) {
      return;
    }

    if (
      ts.isVariableDeclaration(node) &&
      isSnapshotIdentifier(node.name) &&
      node.initializer &&
      isProcessEnvExpression(node.initializer)
    ) {
      found = true;
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isSnapshotIdentifier(node.left) &&
      isProcessEnvExpression(node.right)
    ) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function findFilesMatchingPolicy(predicate: (source: string) => boolean): string[] {
  return findRootTestFiles()
    .filter((file) => predicate(readFileSync(file, 'utf8')))
    .map(toPosixRelativePath)
    .sort();
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

function findTestControlUsages(file: string, source: string): TestControlUsage[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const sourceLines = source.split(/\r?\n/);
  const usages: TestControlUsage[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isPropertyAccessExpression(node) &&
      isTestControlKind(node.name.text) &&
      hasTestApiBase(node.expression)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const fullLineText = sourceLines[position.line] ?? '';
      const trimmedLineText = fullLineText.trim();

      usages.push({
        column: position.character + 1,
        expression: node.getText(sourceFile).replace(/\s+/g, ' '),
        file,
        kind: node.name.text,
        line: position.line + 1,
        fullLineText,
        trimmedLineText,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return usages;
}

function findRootTestControlUsages(): TestControlUsage[] {
  return findRootTestFiles().flatMap((file) =>
    findTestControlUsages(toPosixRelativePath(file), readFileSync(file, 'utf8')),
  );
}

function formatUsage(usage: TestControlUsage) {
  return `${usage.file}:${usage.line}:${usage.column}: ${usage.kind} is not allowed: ${usage.trimmedLineText || usage.expression}`;
}

function isAllowedSkip(usage: TestControlUsage) {
  return allowedSkippedTests.some(
    (allowed) =>
      allowed.file === usage.file &&
      allowed.kind === usage.kind &&
      allowed.linePattern.test(usage.trimmedLineText),
  );
}

describe('root test hygiene', () => {
  const rootUsages = findRootTestControlUsages();

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
    const unapprovedFiles = findFilesMatchingPolicy(hasHoistedPersistentMockWithoutReset)
      .filter((file) => !legacyHoistedPersistentMockFiles.has(file))
      .map(
        (file) =>
          `${file}: hoisted mocks with persistent implementations must reset implementations with mockReset() or vi.resetAllMocks()`,
      );

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps the legacy hoisted mock allowlist scoped to active violations', () => {
    const activeFiles = new Set(findFilesMatchingPolicy(hasHoistedPersistentMockWithoutReset));
    const staleFiles = Array.from(legacyHoistedPersistentMockFiles)
      .filter((file) => !activeFiles.has(file))
      .sort();

    expect(staleFiles).toEqual([]);
  });

  it('keeps new root tests from adding direct process.env mutations', () => {
    const unapprovedFiles = findFilesMatchingPolicy(hasDirectProcessEnvMutation)
      .filter((file) => !legacyDirectProcessEnvMutationFiles.has(file))
      .map(
        (file) =>
          `${file}: use mockProcessEnv() or vi.stubEnv() instead of direct process.env mutation`,
      );

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps new root tests from snapshotting process.env by reference', () => {
    const unapprovedFiles = findFilesMatchingPolicy(hasProcessEnvReferenceSnapshot).map(
      (file) => `${file}: snapshot process.env with { ...process.env } instead of by reference`,
    );

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps the legacy process.env mutation allowlist scoped to active violations', () => {
    const activeFiles = new Set(findFilesMatchingPolicy(hasDirectProcessEnvMutation));
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
    const unapprovedFiles = findFilesMatchingPolicy(hasSleepPromise)
      .filter((file) => !legacySleepPromiseFiles.has(file))
      .map(
        (file) =>
          `${file}: replace 'await new Promise(r => setTimeout(r, ms))' with vi.useFakeTimers() + vi.runAllTimersAsync(), or testing-library waitFor()`,
      );

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps the legacy sleep-wait allowlist scoped to active violations', () => {
    const activeFiles = new Set(findFilesMatchingPolicy(hasSleepPromise));
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
    const unapprovedFiles = findFilesMatchingPolicy(hasModuleScopePersistentMockWithoutReset)
      .filter((file) => !legacyModuleScopePersistentMockFiles.has(file))
      .map(
        (file) =>
          `${file}: module-scope persistent mock setters (mockReturnValue/mockResolvedValue/etc) must be paired with mockReset() or vi.resetAllMocks() in beforeEach to survive random test order`,
      );

    expect(unapprovedFiles).toEqual([]);
  });

  it('keeps the legacy module-scope persistent mock allowlist scoped to active violations', () => {
    const activeFiles = new Set(findFilesMatchingPolicy(hasModuleScopePersistentMockWithoutReset));
    const staleFiles = Array.from(legacyModuleScopePersistentMockFiles)
      .filter((file) => !activeFiles.has(file))
      .sort();

    expect(staleFiles).toEqual([]);
  });
});
