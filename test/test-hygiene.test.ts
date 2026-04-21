import { readdirSync, readFileSync, statSync } from 'node:fs';
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

const hoistedMockPattern = /\bvi\.hoisted\s*\(/;
const persistentMockMethods = [
  'mockImplementation',
  'mockRejectedValue',
  'mockResolvedValue',
  'mockReturnValue',
] as const;
const persistentMockImplementationPattern = new RegExp(
  `\\.(?:${persistentMockMethods.join('|')})\\s*\\(`,
);
const mockImplementationResetPattern = /(?:\.mockReset\s*\(|\bvi\.resetAllMocks\s*\()/;
const processEnvSnapshotIdentifierPattern = /^original[A-Za-z0-9_]*$/i;

function findTestFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
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
});
