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
  lineText: string;
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
const biomeDirectProcessEnvMutationAllowlistStart =
  '// BEGIN direct process.env mutation legacy allowlist';
const biomeDirectProcessEnvMutationAllowlistEnd =
  '// END direct process.env mutation legacy allowlist';

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

const legacyHoistedPersistentMockFiles = new Set([
  'commands/mcp/server.test.ts',
  'onboarding.test.ts',
  'providers/azure/chat-mcp-integration.test.ts',
  'providers/bedrock/knowledgeBase.test.ts',
  'providers/elevenlabs/alignment/index.test.ts',
  'providers/elevenlabs/isolation/index.test.ts',
  'providers/golangCompletion.test.ts',
  'providers/google/gemini-mcp-integration.test.ts',
  'providers/google/util.test.ts',
  'providers/http-pfx-signature.test.ts',
  'providers/http-tls.test.ts',
  'providers/index.test.ts',
  'providers/llamaApi.test.ts',
  'providers/openai/agents.test.ts',
  'providers/openai/chatkit-pool.test.ts',
  'redteam/commands/poison.test.ts',
  'redteam/strategies/simpleVideo.test.ts',
  'sagemaker.test.ts',
  'table.test.ts',
  'tracing/evaluatorTracing.test.ts',
  'util/agent/agentClient.test.ts',
  'util/apiHealth.test.ts',
  'util/functions/loadFunction.test.ts',
  'util/oauth.test.ts',
]);

const legacyDirectProcessEnvMutationFiles = new Set([
  'account.test.ts',
  'assertions/assertionResult.test.ts',
  'assertions/trace.test.ts',
  'cache.test.ts',
  'code-scan-action/main.test.ts',
  'codeScans/mcp/filesystem.test.ts',
  'commands/modelScan.test.ts',
  'constants.test.ts',
  'database.test.ts',
  'envars.test.ts',
  'evaluatorHelpers.test.ts',
  'fetch.test.ts',
  'globalConfig/cloud.test.ts',
  'logger.test.ts',
  'matchers/closed-qa.test.ts',
  'matchers/factuality.test.ts',
  'matchers/similarity.test.ts',
  'matchers/utils.test.ts',
  'onboarding.test.ts',
  'progress/ciProgressReporter.edge-cases.test.ts',
  'progress/ciProgressReporter.test.ts',
  'prompts/index.test.ts',
  'prompts/processors/csv.test.ts',
  'providers.slack.test.ts',
  'providers.test.ts',
  'providers/ai21.test.ts',
  'providers/anthropic/completion.test.ts',
  'providers/anthropic/generic.test.ts',
  'providers/anthropic/messages.test.ts',
  'providers/azure.test.ts',
  'providers/azure/chat.test.ts',
  'providers/azure/completion.test.ts',
  'providers/azure/foundry-agent.test.ts',
  'providers/azure/generic.test.ts',
  'providers/azure/responses-nested-schema.integration.test.ts',
  'providers/azure/responses.test.ts',
  'providers/bedrock.agents.test.ts',
  'providers/bedrock/converse.test.ts',
  'providers/bedrock/index.test.ts',
  'providers/bedrock/knowledgeBase.test.ts',
  'providers/cerebras.test.ts',
  'providers/claude-agent-sdk.test.ts',
  'providers/cloudflare-ai.test.ts',
  'providers/cloudflare-gateway.test.ts',
  'providers/databricks.test.ts',
  'providers/defaults.test.ts',
  'providers/elevenlabs/agents/index.test.ts',
  'providers/elevenlabs/alignment/index.test.ts',
  'providers/elevenlabs/history/index.test.ts',
  'providers/elevenlabs/isolation/index.test.ts',
  'providers/elevenlabs/stt/index.test.ts',
  'providers/elevenlabs/tts/index.test.ts',
  'providers/google/ai.studio.test.ts',
  'providers/google/auth.test.ts',
  'providers/google/gemini-image.test.ts',
  'providers/google/image.test.ts',
  'providers/google/live.test.ts',
  'providers/google/provider.test.ts',
  'providers/google/video.test.ts',
  'providers/groq/chat.test.ts',
  'providers/groq/responses.test.ts',
  'providers/huggingface.test.ts',
  'providers/hyperbolic.test.ts',
  'providers/hyperbolic/audio.test.ts',
  'providers/hyperbolic/image.test.ts',
  'providers/index.test.ts',
  'providers/litellm.test.ts',
  'providers/openai-codex-sdk.e2e.test.ts',
  'providers/openai-codex-sdk.test.ts',
  'providers/openai/assistant.test.ts',
  'providers/openai/chat.test.ts',
  'providers/openai/chatkit.test.ts',
  'providers/openai/codexDefaults.test.ts',
  'providers/openai/completion.test.ts',
  'providers/openai/embedding.test.ts',
  'providers/openai/image.test.ts',
  'providers/openai/index.test.ts',
  'providers/openai/realtime.test.ts',
  'providers/openai/responses.test.ts',
  'providers/openai/transcription.test.ts',
  'providers/openai/video.test.ts',
  'providers/openclaw.test.ts',
  'providers/openrouter.test.ts',
  'providers/pythonCompletion.unicode.test.ts',
  'providers/replicate.test.ts',
  'providers/snowflake.test.ts',
  'providers/truefoundry.test.ts',
  'providers/xai/image.test.ts',
  'providers/xai/voice.test.ts',
  'python/windows-path.test.ts',
  'python/wrapper.test.ts',
  'redteam/extraction/entities.test.ts',
  'redteam/extraction/purpose.test.ts',
  'redteam/extraction/util.test.ts',
  'redteam/index.test.ts',
  'redteam/plugins/teenSafety.test.ts',
  'redteam/plugins/unsafebench.test.ts',
  'redteam/providers/iterative.test.ts',
  'redteam/providers/multi-turn-empty-response.test.ts',
  'redteam/providers/shared.test.ts',
  'redteam/util.test.ts',
  'sagemaker.test.ts',
  'telemetry.test.ts',
  'tracing/evaluatorTracing.test.ts',
  'tracing/integration.test.ts',
  'ui/list/listRunner.test.ts',
  'updates.test.ts',
  'util/apiHealth.test.ts',
  'util/config/load.test.ts',
  'util/config/main.test.ts',
  'util/env.test.ts',
  'util/file.test.ts',
  'util/json.test.ts',
  'util/promptfooCommand.test.ts',
  'util/render.test.ts',
  'util/templates.test.ts',
  'util/transform.test.ts',
  'util/utils.test.ts',
]);

const hoistedMockPattern = /\bvi\.hoisted\s*\(/;
const persistentMockImplementationPattern =
  /\.(?:mockImplementation|mockRejectedValue|mockResolvedValue|mockReturnValue)\s*\(/;
const mockImplementationResetPattern = /(?:\.mockReset\s*\(|\bvi\.resetAllMocks\s*\()/;
const directProcessEnvMutationPattern =
  /(?:\bprocess\.env\s*=|\bprocess\.env(?:\.[A-Za-z_][A-Za-z0-9_]*|\[['"][A-Za-z_][A-Za-z0-9_]*['"]\])\s*=|\bdelete\s+process\.env(?:\.[A-Za-z_][A-Za-z0-9_]*|\[['"][A-Za-z_][A-Za-z0-9_]*['"]\]))/;

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

function hasDirectProcessEnvMutation(source: string) {
  return source.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return (
      trimmed.length > 0 && !trimmed.startsWith('//') && directProcessEnvMutationPattern.test(line)
    );
  });
}

function findFilesMatchingPolicy(predicate: (source: string) => boolean): string[] {
  return findRootTestFiles()
    .filter((file) => predicate(readFileSync(file, 'utf8')))
    .map(toPosixRelativePath)
    .sort();
}

function findBiomeLegacyDirectProcessEnvMutationExclusions(): string[] {
  const source = readFileSync(biomeConfigPath, 'utf8');
  const start = source.indexOf(biomeDirectProcessEnvMutationAllowlistStart);
  const end = source.indexOf(biomeDirectProcessEnvMutationAllowlistEnd);

  if (start === -1 || end === -1 || end < start) {
    throw new Error('Biome process.env mutation allowlist markers are missing or out of order');
  }

  return Array.from(
    source.slice(start, end).matchAll(/"!!test\/([^"]+)"/g),
    ([, file]) => file,
  ).sort();
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
      const lineText = sourceLines[position.line]?.trim() ?? '';

      usages.push({
        column: position.character + 1,
        expression: node.getText(sourceFile).replace(/\s+/g, ' '),
        file,
        kind: node.name.text,
        line: position.line + 1,
        lineText,
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
  return `${usage.file}:${usage.line}:${usage.column}: ${usage.kind} is not allowed: ${usage.lineText || usage.expression}`;
}

function isAllowedSkip(usage: TestControlUsage) {
  return allowedSkippedTests.some(
    (allowed) =>
      allowed.file === usage.file &&
      allowed.kind === usage.kind &&
      allowed.linePattern.test(usage.lineText),
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
              allowed.linePattern.test(usage.lineText),
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
    'process.env["OPENAI_API_KEY"] = "test-key";',
    'delete process.env.OPENAI_API_KEY;',
    'delete process.env["OPENAI_API_KEY"];',
    'process.env = { ...process.env, OPENAI_API_KEY: "test-key" };',
  ])('detects direct process.env mutation in %s', (source) => {
    expect(hasDirectProcessEnvMutation(source)).toBe(true);
  });

  it.each([
    'const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: "test-key" });',
    'vi.stubEnv("OPENAI_API_KEY", "test-key");',
    'const env = { ...process.env, NO_COLOR: "1" };',
    '// process.env.OPENAI_API_KEY = "test-key";',
  ])('allows scoped or read-only environment handling in %s', (source) => {
    expect(hasDirectProcessEnvMutation(source)).toBe(false);
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

  it('keeps the legacy process.env mutation allowlist scoped to active violations', () => {
    const activeFiles = new Set(findFilesMatchingPolicy(hasDirectProcessEnvMutation));
    const staleFiles = Array.from(legacyDirectProcessEnvMutationFiles)
      .filter((file) => !activeFiles.has(file))
      .sort();

    expect(staleFiles).toEqual([]);
  });

  it('keeps Biome process.env mutation exclusions in sync with the hygiene allowlist', () => {
    expect(findBiomeLegacyDirectProcessEnvMutationExclusions()).toEqual(
      Array.from(legacyDirectProcessEnvMutationFiles).sort(),
    );
  });
});
