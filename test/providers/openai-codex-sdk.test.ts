import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { importModule, resolvePackageEntryPoint } from '../../src/esm';
import logger from '../../src/logger';
import { OpenAICodexSDKProvider } from '../../src/providers/openai/codex-sdk';
import { checkProviderApiKeys } from '../../src/util/provider';

import type { CallApiContextParams } from '../../src/types/index';

const mockRun = vi.fn();
const mockRunStreamed = vi.fn();
const mockStartThread = vi.fn();
const mockResumeThread = vi.fn();

// Mock thread instance
const mockThread = {
  id: 'test-thread-123',
  run: mockRun,
  runStreamed: mockRunStreamed,
};

// Mock Codex class
const MockCodex = vi.fn().mockImplementation(function () {
  return {
    startThread: mockStartThread.mockReturnValue(mockThread),
    resumeThread: mockResumeThread.mockReturnValue(mockThread),
  };
});

// Mock SDK module export
const mockCodexSDK = {
  __esModule: true,
  Codex: MockCodex,
  Thread: vi.fn(),
};

// Mock the ESM loader to return our mock SDK
vi.mock('../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
    resolvePackageEntryPoint: vi.fn(() => '@openai/codex-sdk'),
  };
});

// Mock the SDK package (for type safety)
vi.mock('@openai/codex-sdk', () => mockCodexSDK);

// Helper to create mock response matching real SDK format
const createMockResponse = (
  finalResponse: string,
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number },
  items: any[] = [],
) => ({
  finalResponse,
  usage: usage
    ? {
        input_tokens: usage.input_tokens ?? 0,
        cached_input_tokens: usage.cached_input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
      }
    : undefined,
  items,
});

function restoreEnvVar(name: 'OPENAI_API_KEY' | 'CODEX_API_KEY', value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('OpenAICodexSDKProvider', () => {
  let statSyncSpy: MockInstance;
  let existsSyncSpy: MockInstance;
  const mockImportModule = vi.mocked(importModule);
  const mockResolvePackageEntryPoint = vi.mocked(resolvePackageEntryPoint);
  let originalBasePath: string | undefined;
  let originalOpenAiApiKey: string | undefined;
  let originalCodexApiKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalBasePath = cliState.basePath;
    cliState.basePath = undefined;
    originalOpenAiApiKey = process.env.OPENAI_API_KEY;
    originalCodexApiKey = process.env.CODEX_API_KEY;

    // Reset mock implementations
    MockCodex.mockImplementation(function () {
      return {
        startThread: mockStartThread.mockReturnValue(mockThread),
        resumeThread: mockResumeThread.mockReturnValue(mockThread),
      };
    });
    mockStartThread.mockReturnValue(mockThread);
    mockResumeThread.mockReturnValue(mockThread);

    // Mock importModule to return our mock SDK
    mockImportModule.mockResolvedValue(mockCodexSDK);
    mockResolvePackageEntryPoint.mockReset();
    mockResolvePackageEntryPoint.mockReturnValue('@openai/codex-sdk');

    // Default mocks
    statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
    existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    cliState.basePath = originalBasePath;
    restoreEnvVar('OPENAI_API_KEY', originalOpenAiApiKey);
    restoreEnvVar('CODEX_API_KEY', originalCodexApiKey);
    await clearCache();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const provider = new OpenAICodexSDKProvider();

      expect(provider.config).toEqual({});
      expect(provider.id()).toBe('openai:codex-sdk');
    });

    it('should initialize with custom config', () => {
      const config = {
        apiKey: 'test-key',
        model: 'gpt-5.2',
        working_dir: '/test/dir',
      };

      const provider = new OpenAICodexSDKProvider({ config });

      expect(provider.config).toEqual(config);
      expect(provider.apiKey).toBe('test-key');
    });

    it('should use custom id when provided', () => {
      const provider = new OpenAICodexSDKProvider({ id: 'custom-provider-id' });

      expect(provider.id()).toBe('custom-provider-id');
    });

    it('should warn about unknown model', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      new OpenAICodexSDKProvider({ config: { model: 'unknown-model' } });

      expect(warnSpy).toHaveBeenCalledWith(
        'Using unknown model for OpenAI Codex SDK: unknown-model',
      );

      warnSpy.mockRestore();
    });

    it('should not warn about known OpenAI models', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      new OpenAICodexSDKProvider({ config: { model: 'gpt-5.2' } });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should not warn about gpt-5.1-codex models', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

      new OpenAICodexSDKProvider({ config: { model: 'gpt-5.1-codex' } });
      new OpenAICodexSDKProvider({ config: { model: 'gpt-5.1-codex-max' } });
      new OpenAICodexSDKProvider({ config: { model: 'gpt-5.1-codex-mini' } });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('callApi', () => {
    describe('basic functionality', () => {
      it('should successfully call API with simple prompt', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Test response', {
            input_tokens: 10,
            cached_input_tokens: 5,
            output_tokens: 20,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result).toEqual({
          output: 'Test response',
          tokenUsage: {
            prompt: 10, // cached_input_tokens is already included in input_tokens
            completion: 20,
            total: 30, // 10 + 20
            cached: 5,
          },
          cost: 0,
          raw: expect.any(String),
          sessionId: 'test-thread-123',
        });

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: undefined,
          skipGitRepoCheck: false,
        });

        expect(mockRun).toHaveBeenCalledWith('Test prompt', {});
      });

      it('should handle SDK exceptions', async () => {
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        mockRun.mockRejectedValue(new Error('Network error'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Test prompt');

        expect(result.error).toBe('Error calling OpenAI Codex SDK: Network error');
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });

      it('should allow SDK-managed auth when API key is missing', async () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.CODEX_API_KEY;
        mockRun.mockResolvedValue(createMockResponse('Login-backed response'));

        const provider = new OpenAICodexSDKProvider();
        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Login-backed response');
        expect(MockCodex).toHaveBeenCalledTimes(1);

        const codexOptions = MockCodex.mock.calls[0][0];
        expect(codexOptions.apiKey).toBeUndefined();
        expect(codexOptions.env.OPENAI_API_KEY).toBeUndefined();
        expect(codexOptions.env.CODEX_API_KEY).toBeUndefined();
      });

      it('should skip missing API key preflight for SDK-managed auth', () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.CODEX_API_KEY;

        const provider = new OpenAICodexSDKProvider();
        const result = checkProviderApiKeys([provider]);

        expect(result.size).toBe(0);
      });

      it('should fall back to process.cwd() when resolving the SDK from an external config base path', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));
        cliState.basePath = '/tmp/external-config';
        mockResolvePackageEntryPoint.mockImplementation((packageName, basePath) => {
          if (basePath === '/tmp/external-config') {
            return null;
          }
          return packageName === '@openai/codex-sdk' ? '@openai/codex-sdk' : null;
        });

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toBeUndefined();
        expect(mockResolvePackageEntryPoint).toHaveBeenNthCalledWith(
          1,
          '@openai/codex-sdk',
          '/tmp/external-config',
        );
        expect(mockResolvePackageEntryPoint).toHaveBeenNthCalledWith(
          2,
          '@openai/codex-sdk',
          process.cwd(),
        );
      });

      it('should infer skillCalls from Codex command traces', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('CERULEAN-FALCON-SKILL', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command: `/bin/zsh -lc "sed -n '1,200p' .agents/skills/token-skill/SKILL.md"`,
              aggregated_output: '',
              exit_code: 0,
              status: 'completed',
            },
            {
              id: 'item-2',
              type: 'command_execution',
              command: "/bin/zsh -lc 'find .agents -maxdepth 5 -type f -print'",
              aggregated_output:
                '.agents/skills/token-skill/SKILL.md\n.agents/skills/token-skill/agents/openai.yaml\n',
              exit_code: 0,
              status: 'completed',
            },
            {
              id: 'item-3',
              type: 'agent_message',
              text: 'CERULEAN-FALCON-SKILL',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use the token-skill skill');

        expect(result.metadata).toEqual({
          skillCalls: [
            {
              name: 'token-skill',
              path: '.agents/skills/token-skill/SKILL.md',
              source: 'heuristic',
            },
          ],
        });
      });

      it('should infer skillCalls from quoted skill paths', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('CERULEAN-FALCON-SKILL', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command: `/bin/zsh -lc "cat '.agents/skills/token-skill/SKILL.md'"`,
              aggregated_output: '',
              exit_code: 0,
              status: 'completed',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use the token-skill skill');

        expect(result.metadata).toEqual({
          skillCalls: [
            {
              name: 'token-skill',
              path: '.agents/skills/token-skill/SKILL.md',
              source: 'heuristic',
            },
          ],
        });
      });

      it('should ignore wildcard skill paths with shell metacharacters', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('WILDCARD', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command: "/bin/zsh -lc 'cat .agents/skills/*/SKILL.md'",
              aggregated_output: '',
              exit_code: 0,
              status: 'completed',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Read all skills');

        expect(result.metadata).toBeUndefined();
      });

      it('should ignore absolute .agents skill paths outside the current repo root', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('OTHER-REPO', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command: 'cat /tmp/other/.agents/skills/token-skill/SKILL.md',
              aggregated_output: 'CERULEAN-FALCON-SKILL',
              exit_code: 0,
              status: 'completed',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Read another repo skill');

        expect(result.metadata).toBeUndefined();
      });

      it('should not infer skillCalls from directory listings without a direct SKILL.md command read', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('LISTED-FILES', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command: "/bin/zsh -lc 'find .agents -maxdepth 5 -type f -print'",
              aggregated_output:
                '.agents/skills/token-skill/SKILL.md\n.agents/skills/token-skill/agents/openai.yaml\n',
              exit_code: 0,
              status: 'completed',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('List the available files');

        expect(result.metadata).toBeUndefined();
      });

      it('should omit skillCalls when no skill files are read', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('4', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command: '/bin/zsh -lc ls',
              aggregated_output: '',
              exit_code: 0,
              status: 'completed',
            },
            {
              id: 'item-2',
              type: 'agent_message',
              text: '4',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('What is 2 + 2?');

        expect(result.metadata).toBeUndefined();
      });

      it('should infer skillCalls from custom CODEX_HOME skill directories', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('HOME-SKILL', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command: "/bin/zsh -lc 'cat /tmp/promptfoo-codex-home/skills/home-skill/SKILL.md'",
              aggregated_output: '',
              exit_code: 0,
              status: 'completed',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          config: {
            cli_env: {
              CODEX_HOME: '/tmp/promptfoo-codex-home',
            },
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use the home skill');

        expect(result.metadata).toEqual({
          skillCalls: [
            {
              name: 'home-skill',
              path: '/tmp/promptfoo-codex-home/skills/home-skill/SKILL.md',
              source: 'heuristic',
            },
          ],
        });
      });

      it('should report attempted skill reads separately from confirmed skillCalls', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('FALLBACK', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command: `/bin/zsh -lc "cat .agents/skills/token-skill/SKILL.md"`,
              aggregated_output: 'cat: command not found',
              exit_code: 127,
              status: 'failed',
            },
            {
              id: 'item-2',
              type: 'agent_message',
              text: 'FALLBACK',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Use the token-skill skill');

        expect(result.metadata).toEqual({
          attemptedSkillCalls: [
            {
              name: 'token-skill',
              path: '.agents/skills/token-skill/SKILL.md',
              source: 'heuristic',
            },
          ],
        });
      });

      it('should ignore unrelated SKILL.md paths outside known Codex skill roots', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('UNRELATED', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command:
                "/bin/zsh -lc 'cat /tmp/unrelated-project/skills/not-a-codex-skill/SKILL.md'",
              aggregated_output: '',
              exit_code: 0,
              status: 'completed',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Read the unrelated SKILL file');

        expect(result.metadata).toBeUndefined();
      });

      it('should ignore arbitrary hidden .codex skill paths outside the configured home root', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('UNRELATED', undefined, [
            {
              id: 'item-1',
              type: 'command_execution',
              command:
                "/bin/zsh -lc 'cat /tmp/unrelated-home/.codex/skills/not-a-codex-skill/SKILL.md'",
              aggregated_output: '',
              exit_code: 0,
              status: 'completed',
            },
          ]),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        const result = await provider.callApi('Read the unrelated hidden Codex skill file');

        expect(result.metadata).toBeUndefined();
      });
    });

    describe('working directory management', () => {
      it('should use custom working_dir when provided', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/custom/dir' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        await provider.callApi('Test prompt');

        expect(statSyncSpy).toHaveBeenCalledWith('/custom/dir');
        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/custom/dir',
          skipGitRepoCheck: false,
        });
      });

      it('should error when working_dir does not exist', async () => {
        statSyncSpy.mockImplementation(function () {
          throw new Error('ENOENT: no such file or directory');
        });

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/nonexistent/dir' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          /Working directory \/nonexistent\/dir does not exist/,
        );
      });

      it('should error when working_dir is not a directory', async () => {
        statSyncSpy.mockReturnValue({
          isDirectory: () => false,
        } as fs.Stats);

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/path/to/file.txt' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          'Working directory /path/to/file.txt is not a directory',
        );
      });

      it('should error when working_dir is not a Git repo', async () => {
        existsSyncSpy.mockReturnValue(false);

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/path/to/non-git-dir' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(/is not a Git repository/);
      });

      it('should bypass Git check when skip_git_repo_check is true', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            working_dir: '/path/to/non-git-dir',
            skip_git_repo_check: true,
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Response');
        expect(result.error).toBeUndefined();
        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/path/to/non-git-dir',
          skipGitRepoCheck: true,
        });
      });

      it('should pass additional_directories to startThread', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            working_dir: '/main/dir',
            additional_directories: ['/extra/dir1', '/extra/dir2'],
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/main/dir',
          skipGitRepoCheck: false,
          additionalDirectories: ['/extra/dir1', '/extra/dir2'],
        });
      });

      it('should not include additionalDirectories when empty', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            working_dir: '/main/dir',
            additional_directories: [],
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/main/dir',
          skipGitRepoCheck: false,
        });
      });
    });

    describe('thread management', () => {
      it('should create ephemeral threads by default', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');
        expect(mockStartThread).toHaveBeenCalledTimes(1);

        // Second call should create new thread
        await provider.callApi('Test prompt');
        expect(mockStartThread).toHaveBeenCalledTimes(2);
      });

      it('should isolate concurrent calls with different prompt-level apiKeys', async () => {
        const firstRun = createDeferred<ReturnType<typeof createMockResponse>>();
        const secondRun = createDeferred<ReturnType<typeof createMockResponse>>();
        const firstDestroy = vi.fn();
        const secondDestroy = vi.fn();
        const firstThread = {
          id: 'thread-1',
          run: vi.fn().mockReturnValue(firstRun.promise),
          runStreamed: mockRunStreamed,
        };
        const secondThread = {
          id: 'thread-2',
          run: vi.fn().mockReturnValue(secondRun.promise),
          runStreamed: mockRunStreamed,
        };

        MockCodex.mockImplementationOnce(function () {
          return {
            startThread: vi.fn().mockReturnValue(firstThread),
            resumeThread: vi.fn().mockReturnValue(firstThread),
            destroy: firstDestroy,
          };
        }).mockImplementationOnce(function () {
          return {
            startThread: vi.fn().mockReturnValue(secondThread),
            resumeThread: vi.fn().mockReturnValue(secondThread),
            destroy: secondDestroy,
          };
        });

        const provider = new OpenAICodexSDKProvider();

        const firstCall = provider.callApi('Test prompt', {
          prompt: {
            config: { apiKey: 'prompt-key-1' },
          },
        } as any);

        await vi.waitFor(() => {
          expect(firstThread.run).toHaveBeenCalledTimes(1);
        });

        const secondCall = provider.callApi('Test prompt', {
          prompt: {
            config: { apiKey: 'prompt-key-2' },
          },
        } as any);

        await vi.waitFor(() => {
          expect(secondThread.run).toHaveBeenCalledTimes(1);
        });

        expect(firstDestroy).not.toHaveBeenCalled();
        expect(secondDestroy).not.toHaveBeenCalled();

        firstRun.resolve(createMockResponse('First response'));
        secondRun.resolve(createMockResponse('Second response'));

        await expect(firstCall).resolves.toEqual(
          expect.objectContaining({ output: 'First response', sessionId: 'thread-1' }),
        );
        await expect(secondCall).resolves.toEqual(
          expect.objectContaining({ output: 'Second response', sessionId: 'thread-2' }),
        );
        expect(MockCodex).toHaveBeenCalledTimes(2);
      });

      it('should reuse threads when persist_threads is true', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { persist_threads: true },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('First prompt');
        expect(mockStartThread).toHaveBeenCalledTimes(1);

        await provider.callApi('First prompt'); // Same prompt = same cache key
        expect(mockStartThread).toHaveBeenCalledTimes(1); // No new thread
        expect(mockRun).toHaveBeenCalledTimes(2);
      });

      it('should resume thread when thread_id is provided', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { thread_id: 'existing-thread-123' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockResumeThread).toHaveBeenCalledWith('existing-thread-123', {
          skipGitRepoCheck: false,
          workingDirectory: undefined,
        });
        expect(mockStartThread).not.toHaveBeenCalled();
      });

      it('should reuse cached thread when resuming same thread_id', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            thread_id: 'existing-thread-123',
            persist_threads: true,
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        // First call should resume thread
        await provider.callApi('Test prompt 1');
        expect(mockResumeThread).toHaveBeenCalledTimes(1);

        // Second call should use cached thread (not resume again)
        await provider.callApi('Test prompt 2');
        expect(mockResumeThread).toHaveBeenCalledTimes(1); // Still 1
        expect(mockRun).toHaveBeenCalledTimes(2); // But ran twice
      });

      it('should enforce thread pool size limits', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            persist_threads: true,
            thread_pool_size: 2,
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        // Create 3 different prompts (different cache keys)
        await provider.callApi('Prompt 1');
        await provider.callApi('Prompt 2');
        await provider.callApi('Prompt 3'); // Should evict oldest

        expect(mockStartThread).toHaveBeenCalledTimes(3);
      });
    });

    describe('structured output', () => {
      it('should handle JSON schema output', async () => {
        const schema = {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            status: { type: 'string', enum: ['ok', 'error'] },
          },
          required: ['summary', 'status'],
        };

        mockRun.mockResolvedValue(createMockResponse('{"summary":"All good","status":"ok"}'));

        const provider = new OpenAICodexSDKProvider({
          config: { output_schema: schema },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Summarize status');

        expect(mockRun).toHaveBeenCalledWith('Summarize status', {
          outputSchema: schema,
        });

        expect(result.output).toBe('{"summary":"All good","status":"ok"}');
      });
    });

    describe('sandbox and network options', () => {
      it('should pass sandbox_mode to thread options', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            sandbox_mode: 'read-only',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect((MockCodex.mock.instances[0] as any).startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            sandboxMode: 'read-only',
          }),
        );
      });

      it('should pass network and web search options to thread', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            network_access_enabled: true,
            web_search_enabled: true,
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect((MockCodex.mock.instances[0] as any).startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            networkAccessEnabled: true,
            webSearchEnabled: true,
          }),
        );
      });

      it('should pass web_search_mode to thread options', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            web_search_mode: 'live',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect((MockCodex.mock.instances[0] as any).startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            webSearchMode: 'live',
          }),
        );
      });

      it('should prefer web_search_mode over web_search_enabled', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            web_search_enabled: true,
            web_search_mode: 'cached',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        const threadOpts = (MockCodex.mock.instances[0] as any).startThread.mock.calls[0][0];
        expect(threadOpts.webSearchMode).toBe('cached');
        expect(threadOpts.webSearchEnabled).toBeUndefined();
      });

      it('should pass model_reasoning_effort to thread options', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            model_reasoning_effort: 'high',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect((MockCodex.mock.instances[0] as any).startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            modelReasoningEffort: 'high',
          }),
        );
      });

      it('should pass approval_policy to thread options', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            approval_policy: 'never',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect((MockCodex.mock.instances[0] as any).startThread).toHaveBeenCalledWith(
          expect.objectContaining({
            approvalPolicy: 'never',
          }),
        );
      });
    });

    describe('cost calculation', () => {
      it('should calculate cost for gpt-5.1-codex model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 1000,
            cached_input_tokens: 0,
            output_tokens: 500,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.1-codex' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.1-codex: $2/1M input, $8/1M output
        // Cost = (1000 * 2/1000000) + (500 * 8/1000000) = 0.002 + 0.004 = 0.006
        expect(result.cost).toBeCloseTo(0.006, 6);
      });

      it('should calculate cost for gpt-5.1-codex-mini model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 2000,
            cached_input_tokens: 500,
            output_tokens: 1000,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.1-codex-mini' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.1-codex-mini: $0.5/1M input, $0.05/1M cache_read, $2/1M output
        // uncached input = 2000 - 500 = 1500, cached = 500
        // Cost = (1500 * 0.5/1000000) + (500 * 0.05/1000000) + (1000 * 2/1000000)
        //      = 0.00075 + 0.000025 + 0.002 = 0.002775
        expect(result.cost).toBeCloseTo(0.002775, 6);
      });

      it('should return 0 cost when model pricing not found', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 100,
            output_tokens: 50,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'unknown-model' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.cost).toBe(0);
      });

      it('should return 0 cost when no model specified', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 100,
            output_tokens: 50,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.cost).toBe(0);
      });

      it('should return 0 cost when no usage data', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.1-codex' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.cost).toBe(0);
      });
    });

    describe('streaming', () => {
      it('should handle streaming events', async () => {
        const mockEvents = async function* () {
          yield {
            type: 'item.completed',
            item: { id: 'item-1', type: 'agent_message', text: 'Part 1' },
          };
          yield {
            type: 'item.completed',
            item: { id: 'item-2', type: 'agent_message', text: 'Part 2' },
          };
          yield {
            type: 'turn.completed',
            usage: { input_tokens: 10, cached_input_tokens: 5, output_tokens: 20 },
          };
        };

        mockRunStreamed.mockResolvedValue({ events: mockEvents() });

        const provider = new OpenAICodexSDKProvider({
          config: { enable_streaming: true },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Part 1\nPart 2');
        expect(result.tokenUsage).toEqual({
          prompt: 10, // cached_input_tokens is already included in input_tokens
          completion: 20,
          total: 30, // 10 + 20
          cached: 5,
        });
      });

      it('should abort streaming on signal', async () => {
        const mockEvents = async function* () {
          yield {
            type: 'item.completed',
            item: { id: 'item-1', type: 'agent_message', text: 'Part 1' },
          };
          // Abort will happen here
        };

        mockRunStreamed.mockResolvedValue({ events: mockEvents() });

        const provider = new OpenAICodexSDKProvider({
          config: { enable_streaming: true },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const abortController = new AbortController();
        abortController.abort();

        const result = await provider.callApi('Test prompt', undefined, {
          abortSignal: abortController.signal,
        });

        expect(result.error).toBe('OpenAI Codex SDK call aborted before it started');
      });
    });

    describe('config merging', () => {
      it('should merge provider and prompt configs', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            model: 'gpt-5.2',
            working_dir: '/test/dir',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const context: CallApiContextParams = {
          prompt: {
            raw: 'Test prompt',
            label: 'test',
            config: {
              output_schema: { type: 'object' },
            },
          },
          vars: {},
        };

        await provider.callApi('Test prompt', context);

        expect(mockRun).toHaveBeenCalledWith('Test prompt', {
          outputSchema: { type: 'object' },
        });
      });

      it('should prioritize prompt config over provider config', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: { working_dir: '/provider/dir' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const context: CallApiContextParams = {
          prompt: {
            raw: 'Test prompt',
            label: 'test',
            config: { working_dir: '/prompt/dir' },
          },
          vars: {},
        };

        await provider.callApi('Test prompt', context);

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: '/prompt/dir',
          skipGitRepoCheck: false,
        });
      });

      it('should create separate Codex instances for prompt-level base_url overrides', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt', {
          prompt: {
            raw: 'Test prompt',
            label: 'test-1',
            config: { base_url: 'https://proxy-one.example.com' },
          },
          vars: {},
        });
        await provider.callApi('Test prompt', {
          prompt: {
            raw: 'Test prompt',
            label: 'test-2',
            config: { base_url: 'https://proxy-two.example.com' },
          },
          vars: {},
        });

        expect(MockCodex).toHaveBeenCalledTimes(2);
        expect(MockCodex).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ baseUrl: 'https://proxy-one.example.com' }),
        );
        expect(MockCodex).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ baseUrl: 'https://proxy-two.example.com' }),
        );
      });
    });

    describe('abort signal', () => {
      it('should handle pre-aborted signal', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const abortController = new AbortController();
        abortController.abort();

        const result = await provider.callApi('Test prompt', undefined, {
          abortSignal: abortController.signal,
        });

        expect(result.error).toBe('OpenAI Codex SDK call aborted before it started');
        expect(mockRun).not.toHaveBeenCalled();
      });

      it('should handle abort during execution', async () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        const abortError = new Error('AbortError');
        abortError.name = 'AbortError';
        mockRun.mockRejectedValue(abortError);

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt', undefined, {
          abortSignal: new AbortController().signal,
        });

        expect(result.error).toBe('OpenAI Codex SDK call aborted');
        expect(warnSpy).toHaveBeenCalledWith('OpenAI Codex SDK call aborted');

        warnSpy.mockRestore();
      });
    });

    describe('environment variables', () => {
      it('should use default env inheritance', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith(
          expect.objectContaining({
            apiKey: 'test-api-key',
            env: expect.objectContaining({
              OPENAI_API_KEY: 'test-api-key',
              CODEX_API_KEY: 'test-api-key',
            }),
          }),
        );
      });

      it('should use custom cli_env', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));
        process.env.PROMPTFOO_TEST_EXISTING = 'present';

        try {
          const provider = new OpenAICodexSDKProvider({
            config: {
              cli_env: {
                CUSTOM_VAR: 'custom-value',
              },
            },
            env: { OPENAI_API_KEY: 'test-api-key' },
          });

          await provider.callApi('Test prompt');

          expect(MockCodex).toHaveBeenCalledWith(
            expect.objectContaining({
              env: expect.objectContaining({
                CUSTOM_VAR: 'custom-value',
                OPENAI_API_KEY: 'test-api-key',
                PATH: expect.any(String),
              }),
            }),
          );
          expect(MockCodex).toHaveBeenCalledWith(
            expect.objectContaining({
              env: expect.not.objectContaining({
                PROMPTFOO_TEST_EXISTING: 'present',
              }),
            }),
          );
        } finally {
          delete process.env.PROMPTFOO_TEST_EXISTING;
        }
      });

      it('should handle codex_path_override', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            codex_path_override: '/custom/path/to/codex',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith(
          expect.objectContaining({
            env: expect.any(Object),
            codexPathOverride: '/custom/path/to/codex',
          }),
        );
      });
    });

    describe('model configuration', () => {
      it('should pass model to startThread', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            model: 'gpt-5.2',
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: undefined,
          skipGitRepoCheck: false,
          model: 'gpt-5.2',
        });
      });

      it('should not include model in startThread if not specified', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(mockStartThread).toHaveBeenCalledWith({
          workingDirectory: undefined,
          skipGitRepoCheck: false,
        });
      });
    });

    describe('API key priority', () => {
      beforeEach(() => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.CODEX_API_KEY;
      });

      it('should prioritize config apiKey over env vars', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        process.env.OPENAI_API_KEY = 'env-key';
        const provider = new OpenAICodexSDKProvider({
          config: { apiKey: 'config-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith(
          expect.objectContaining({
            apiKey: 'config-key',
            env: expect.objectContaining({
              OPENAI_API_KEY: 'config-key',
              CODEX_API_KEY: 'config-key',
            }),
          }),
        );
      });

      it('should use prompt config apiKey over provider and process env vars', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        process.env.OPENAI_API_KEY = 'process-env-key';
        const provider = new OpenAICodexSDKProvider({
          env: { OPENAI_API_KEY: 'provider-env-key' },
        });

        await provider.callApi('Test prompt', {
          prompt: {
            config: { apiKey: 'prompt-key' },
          },
        } as any);

        expect(MockCodex).toHaveBeenCalledWith(
          expect.objectContaining({
            apiKey: 'prompt-key',
            env: expect.objectContaining({
              OPENAI_API_KEY: 'prompt-key',
              CODEX_API_KEY: 'prompt-key',
            }),
          }),
        );
      });

      it('should use CODEX_API_KEY from env if available', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          env: { CODEX_API_KEY: 'codex-env-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith(
          expect.objectContaining({
            apiKey: 'codex-env-key',
            env: expect.objectContaining({
              OPENAI_API_KEY: 'codex-env-key',
              CODEX_API_KEY: 'codex-env-key',
            }),
          }),
        );
      });
    });

    describe('cli_config', () => {
      it('should pass cli_config to Codex constructor', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        const provider = new OpenAICodexSDKProvider({
          config: {
            cli_config: { collaboration_mode: 'coding', model_provider: { timeout: 30 } },
          },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        await provider.callApi('Test prompt');

        expect(MockCodex).toHaveBeenCalledWith(
          expect.objectContaining({
            config: { collaboration_mode: 'coding', model_provider: { timeout: 30 } },
          }),
        );
      });

      it('should merge cli_env with inherited process env when inherit_process_env is enabled', async () => {
        mockRun.mockResolvedValue(createMockResponse('Response'));

        process.env.PROMPTFOO_TEST_EXISTING = 'present';
        try {
          const provider = new OpenAICodexSDKProvider({
            config: {
              cli_env: { CODEX_HOME: '/tmp/codex-home' },
              inherit_process_env: true,
            },
            env: { OPENAI_API_KEY: 'test-api-key' },
          });

          await provider.callApi('Test prompt');

          expect(MockCodex).toHaveBeenCalledWith(
            expect.objectContaining({
              env: expect.objectContaining({
                PROMPTFOO_TEST_EXISTING: 'present',
                CODEX_HOME: '/tmp/codex-home',
                OPENAI_API_KEY: 'test-api-key',
              }),
            }),
          );
        } finally {
          delete process.env.PROMPTFOO_TEST_EXISTING;
        }
      });
    });

    describe('GPT-5.2, GPT-5.3, and GPT-5.4 models', () => {
      it('should recognize gpt-5.4 as a known model', () => {
        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.4' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        expect(provider.config.model).toBe('gpt-5.4');
      });

      it('should recognize gpt-5.4-pro as a known model', () => {
        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.4-pro' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        expect(provider.config.model).toBe('gpt-5.4-pro');
      });

      it('should calculate cost for gpt-5.4 model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 1000,
            cached_input_tokens: 0,
            output_tokens: 500,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.4' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.4: $2.5/1M input, $15/1M output
        // Cost = (1000 * 2.5/1000000) + (500 * 15/1000000) = 0.0025 + 0.0075 = 0.01
        expect(result.cost).toBeCloseTo(0.01, 6);
      });

      it('should calculate cost for gpt-5.4 model with cached input tokens', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 2000,
            cached_input_tokens: 500,
            output_tokens: 1000,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.4' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.4: $2.5/1M input, $0.25/1M cache_read, $15/1M output
        // uncached input = 2000 - 500 = 1500, cached = 500
        // Cost = (1500 * 2.5/1000000) + (500 * 0.25/1000000) + (1000 * 15/1000000)
        //      = 0.00375 + 0.000125 + 0.015 = 0.018875
        expect(result.cost).toBeCloseTo(0.018875, 6);
      });

      it('should calculate cost for gpt-5.4-pro model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 1000,
            cached_input_tokens: 0,
            output_tokens: 500,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.4-pro' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.4-pro: $30/1M input, $180/1M output
        // Cost = (1000 * 30/1000000) + (500 * 180/1000000) = 0.03 + 0.09 = 0.12
        expect(result.cost).toBeCloseTo(0.12, 6);
      });

      it('should calculate cost for gpt-5.4-pro model without cache discount', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 2000,
            cached_input_tokens: 500,
            output_tokens: 1000,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.4-pro' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.4-pro has no discounted cached-input pricing.
        // uncached input = 2000 - 500 = 1500, cached = 500, both billed at $30/1M.
        // Cost = (1500 * 30/1000000) + (500 * 30/1000000) + (1000 * 180/1000000)
        //      = 0.045 + 0.015 + 0.18 = 0.24
        expect(result.cost).toBeCloseTo(0.24, 6);
      });

      it('should recognize gpt-5.2-codex as a known model', () => {
        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.2-codex' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        expect(provider.config.model).toBe('gpt-5.2-codex');
      });

      it('should recognize gpt-5.3-codex as a known model', () => {
        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.3-codex' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        expect(provider.config.model).toBe('gpt-5.3-codex');
      });

      it('should calculate cost for gpt-5.2-codex model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 1000,
            cached_input_tokens: 0,
            output_tokens: 500,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.2-codex' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.2-codex: $1.75/1M input, $14/1M output
        // Cost = (1000 * 1.75/1000000) + (500 * 14/1000000) = 0.00175 + 0.007 = 0.00875
        expect(result.cost).toBeCloseTo(0.00875, 6);
      });

      it('should calculate cost for gpt-5.2 model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 1000,
            cached_input_tokens: 0,
            output_tokens: 500,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.2' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.2: $1.75/1M input, $14/1M output
        // Cost = (1000 * 1.75/1000000) + (500 * 14/1000000) = 0.00175 + 0.007 = 0.00875
        expect(result.cost).toBeCloseTo(0.00875, 6);
      });

      it('should recognize gpt-5.3-codex-spark as a known model', () => {
        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.3-codex-spark' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        expect(provider.config.model).toBe('gpt-5.3-codex-spark');
      });

      it('should calculate cost for gpt-5.3-codex model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 1000,
            cached_input_tokens: 0,
            output_tokens: 500,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.3-codex' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.3-codex: $1.75/1M input, $14/1M output
        // Cost = (1000 * 1.75/1000000) + (500 * 14/1000000) = 0.00175 + 0.007 = 0.00875
        expect(result.cost).toBeCloseTo(0.00875, 6);
      });

      it('should calculate cost for gpt-5.3-codex-spark model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 2000,
            cached_input_tokens: 500,
            output_tokens: 1000,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.3-codex-spark' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.3-codex-spark: $0.5/1M input, $0.05/1M cache_read, $4/1M output
        // uncached input = 2000 - 500 = 1500, cached = 500
        // Cost = (1500 * 0.5/1000000) + (500 * 0.05/1000000) + (1000 * 4/1000000)
        //      = 0.00075 + 0.000025 + 0.004 = 0.004775
        expect(result.cost).toBeCloseTo(0.004775, 6);
      });
    });

    describe('GPT-5.4 models', () => {
      it('should recognize gpt-5.4 as a known model', () => {
        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.4' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });
        expect(provider.config.model).toBe('gpt-5.4');
      });

      it('should calculate cost for gpt-5.4 model', async () => {
        mockRun.mockResolvedValue(
          createMockResponse('Response', {
            input_tokens: 1000,
            cached_input_tokens: 0,
            output_tokens: 500,
          }),
        );

        const provider = new OpenAICodexSDKProvider({
          config: { model: 'gpt-5.4' },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        // gpt-5.4: $2.5/1M input, $15/1M output
        // Cost = (1000 * 2.5/1000000) + (500 * 15/1000000) = 0.0025 + 0.0075 = 0.01
        expect(result.cost).toBeCloseTo(0.01, 6);
      });
    });

    describe('streaming events', () => {
      it('should handle item.updated events', async () => {
        const mockEvents = async function* () {
          yield {
            type: 'item.started',
            item: { id: 'item-1', type: 'command_execution', command: 'ls' },
          };
          yield {
            type: 'item.updated',
            item: { id: 'item-1', type: 'command_execution', command: 'ls', status: 'in_progress' },
          };
          yield {
            type: 'item.completed',
            item: {
              id: 'item-1',
              type: 'agent_message',
              text: 'Done',
            },
          };
          yield {
            type: 'turn.completed',
            usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 20 },
          };
        };

        mockRunStreamed.mockResolvedValue({ events: mockEvents() });

        const provider = new OpenAICodexSDKProvider({
          config: { enable_streaming: true },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.output).toBe('Done');
        expect(result.error).toBeUndefined();
      });

      it('should handle turn.failed events', async () => {
        const mockEvents = async function* () {
          yield {
            type: 'turn.failed',
            error: { message: 'Model overloaded' },
          };
        };

        mockRunStreamed.mockResolvedValue({ events: mockEvents() });

        const provider = new OpenAICodexSDKProvider({
          config: { enable_streaming: true },
          env: { OPENAI_API_KEY: 'test-api-key' },
        });

        const result = await provider.callApi('Test prompt');

        expect(result.error).toContain('Codex turn failed: Model overloaded');
      });
    });
  });

  describe('toString', () => {
    it('should return provider string representation', () => {
      const provider = new OpenAICodexSDKProvider();
      expect(provider.toString()).toBe('[OpenAI Codex SDK Provider]');
    });
  });

  describe('trace attribute helpers', () => {
    it('should serialize MCP tool input for tracing', () => {
      const provider = new OpenAICodexSDKProvider({
        env: { OPENAI_API_KEY: 'test-api-key' },
      });

      expect(
        (provider as any).getAttributesForItem({
          type: 'mcp_tool_call',
          server: 'inventory',
          tool: 'search_inventory',
          input: {
            query: 'quantum computing',
            limit: 3,
          },
        }),
      ).toEqual({
        'codex.mcp.server': 'inventory',
        'codex.mcp.tool': 'search_inventory',
        'codex.mcp.input': '{"query":"quantum computing","limit":3}',
      });

      expect(
        (provider as any).getCompletionAttributesForItem({
          type: 'mcp_tool_call',
          status: 'completed',
          input: {
            query: 'quantum computing',
            limit: 3,
          },
        }),
      ).toEqual({
        'codex.status': 'completed',
        'codex.mcp.input': '{"query":"quantum computing","limit":3}',
      });
    });

    it('should redact sensitive MCP tool input before tracing', () => {
      const provider = new OpenAICodexSDKProvider({
        env: { OPENAI_API_KEY: 'test-api-key' },
      });

      expect(
        (provider as any).getAttributesForItem({
          type: 'mcp_tool_call',
          tool: 'search_inventory',
          input: {
            query: 'quantum computing',
            email: 'user@example.com',
            apiKey: 'sk-secret-value',
            headers: {
              Authorization: 'Bearer secret-token',
            },
          },
        }),
      ).toEqual({
        'codex.mcp.tool': 'search_inventory',
        'codex.mcp.input':
          '{"query":"quantum computing","email":"[REDACTED]","apiKey":"[REDACTED]","headers":{"Authorization":"[REDACTED]"}}',
      });

      expect(
        (provider as any).getCompletionAttributesForItem({
          type: 'mcp_tool_call',
          status: 'completed',
          input: '{"password":"secret","query":"quantum computing"}',
        }),
      ).toEqual({
        'codex.status': 'completed',
        'codex.mcp.input': '{"password":"[REDACTED]","query":"quantum computing"}',
      });

      expect(
        (provider as any).getCompletionAttributesForItem({
          type: 'mcp_tool_call',
          status: 'completed',
          input: 'user@example.com',
        }),
      ).toEqual({
        'codex.status': 'completed',
        'codex.mcp.input': '[REDACTED]',
      });
    });

    it('should attach inferred skill attributes to Codex command spans', () => {
      const provider = new OpenAICodexSDKProvider({
        env: { OPENAI_API_KEY: 'test-api-key' },
      });

      expect(
        (provider as any).getAttributesForItem(
          {
            type: 'command_execution',
            command:
              "/bin/zsh -lc 'cat /tmp/promptfoo-codex-home/skills/token-skill/SKILL.md && cat .agents/skills/repo-skill/SKILL.md'",
          },
          ['/tmp/promptfoo-codex-home'],
        ),
      ).toEqual({
        'codex.command':
          "/bin/zsh -lc 'cat /tmp/promptfoo-codex-home/skills/token-skill/SKILL.md && cat .agents/skills/repo-skill/SKILL.md'",
      });

      expect(
        (provider as any).getCompletionAttributesForItem(
          {
            type: 'command_execution',
            command:
              "/bin/zsh -lc 'cat /tmp/promptfoo-codex-home/skills/token-skill/SKILL.md && cat .agents/skills/repo-skill/SKILL.md'",
            status: 'completed',
            exit_code: 0,
            aggregated_output:
              '/tmp/promptfoo-codex-home/skills/token-skill/SKILL.md\n.agents/skills/repo-skill/SKILL.md\n',
          },
          ['/tmp/promptfoo-codex-home'],
        ),
      ).toEqual({
        'codex.exit_code': 0,
        'codex.status': 'completed',
        'codex.output':
          '/tmp/promptfoo-codex-home/skills/token-skill/SKILL.md\n.agents/skills/repo-skill/SKILL.md\n',
        'promptfoo.skill.count': 2,
        'promptfoo.skill.names': 'token-skill,repo-skill',
        'promptfoo.skill.paths':
          '/tmp/promptfoo-codex-home/skills/token-skill/SKILL.md,.agents/skills/repo-skill/SKILL.md',
      });

      expect(
        (provider as any).getCompletionAttributesForItem(
          {
            type: 'command_execution',
            status: 'failed',
            exit_code: 127,
            aggregated_output: 'cat: command not found',
            command: "/bin/zsh -lc 'cat .agents/skills/token-skill/SKILL.md'",
          },
          ['/tmp/promptfoo-codex-home'],
        ),
      ).toEqual({
        'codex.exit_code': 127,
        'codex.status': 'failed',
        'codex.output': 'cat: command not found',
      });

      expect(
        (provider as any).getAttributesForItem({
          type: 'command_execution',
          command: "/bin/zsh -lc 'cat /tmp/unrelated-project/skills/not-a-codex-skill/SKILL.md'",
        }),
      ).toEqual({
        'codex.command':
          "/bin/zsh -lc 'cat /tmp/unrelated-project/skills/not-a-codex-skill/SKILL.md'",
      });
    });
  });

  describe('cleanup', () => {
    it('should clear threads map', async () => {
      mockRun.mockResolvedValue(createMockResponse('Response'));

      const provider = new OpenAICodexSDKProvider({
        config: { persist_threads: true },
        env: { OPENAI_API_KEY: 'test-api-key' },
      });

      // Create a persisted thread
      await provider.callApi('Test prompt');

      // Verify thread was persisted
      expect((provider as any).threads.size).toBe(1);

      // Cleanup
      await provider.cleanup();

      // Verify threads cleared
      expect((provider as any).threads.size).toBe(0);
    });
  });
});
