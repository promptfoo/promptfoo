/**
 * End-to-End tests for OpenAI Codex SDK Provider
 * These tests use the real @openai/codex-sdk package (must be installed)
 *
 * Requirements:
 * - @openai/codex-sdk package installed
 * - CODEX_API_KEY, CODEX_E2E_API_KEY, or OPENAI_API_KEY environment variable
 * - Access to Codex-compatible models (gpt-5.2, gpt-5.1-codex, etc.)
 *
 * Run with:
 *   CODEX_API_KEY=... npx vitest run openai-codex-sdk.e2e
 *
 * Model configuration:
 *   Set CODEX_E2E_MODEL to override the default model (gpt-5.2).
 *   Example: CODEX_E2E_MODEL=gpt-5.1-codex npx vitest run openai-codex-sdk.e2e
 *
 * Note: These models may require specific API access tiers or partnerships.
 * Tests will be skipped automatically if prerequisites are not met.
 */

import fs from 'fs';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@openai/codex-sdk');
vi.unmock('../../src/esm');

const hasSdk = fs.existsSync(
  path.resolve(process.cwd(), 'node_modules/@openai/codex-sdk/package.json'),
);
const openAiApiKey =
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'test-openai-api-key'
    ? process.env.OPENAI_API_KEY
    : undefined;
const e2eApiKey = process.env.CODEX_E2E_API_KEY || process.env.CODEX_API_KEY || openAiApiKey;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalCodexApiKey = process.env.CODEX_API_KEY;

// vitest.setup.ts installs a dummy OPENAI_API_KEY for unit tests. Ignore that value for E2E runs,
// and only restore a real key when one is explicitly provided.
if (e2eApiKey) {
  process.env.OPENAI_API_KEY = e2eApiKey;
  process.env.CODEX_API_KEY = e2eApiKey;
}

afterAll(() => {
  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }

  if (originalCodexApiKey === undefined) {
    delete process.env.CODEX_API_KEY;
  } else {
    process.env.CODEX_API_KEY = originalCodexApiKey;
  }
});

import { OpenAICodexSDKProvider } from '../../src/providers/openai/codex-sdk';

// Default model for E2E tests - override with CODEX_E2E_MODEL environment variable
const DEFAULT_E2E_MODEL = process.env.CODEX_E2E_MODEL || 'gpt-5.2';

describe('OpenAICodexSDKProvider E2E', () => {
  const hasApiKey = !!e2eApiKey;
  const testTimeout = 60000; // 60 seconds for real API calls

  // Skip all tests if no API key or SDK not installed
  const describeOrSkip = hasApiKey && hasSdk ? describe : describe.skip;

  beforeAll(() => {
    if (!hasSdk) {
      console.warn('Skipping E2E tests: @openai/codex-sdk not installed');
    } else if (hasApiKey) {
      console.info(`Running E2E tests with model: ${DEFAULT_E2E_MODEL}`);
      console.info('(Set CODEX_E2E_MODEL to use a different model)');
    } else {
      console.warn(
        'Skipping E2E tests: No real CODEX_API_KEY, CODEX_E2E_API_KEY, or OPENAI_API_KEY found',
      );
    }
  });

  describeOrSkip('Real SDK Integration', () => {
    it(
      'should successfully generate code with real SDK',
      async () => {
        const provider = new OpenAICodexSDKProvider({
          config: {
            model: DEFAULT_E2E_MODEL,
            working_dir: process.cwd(),
            skip_git_repo_check: false,
          },
        });

        const response = await provider.callApi(
          'Write a Python function that calculates fibonacci numbers. Output only the code.',
        );

        expect(response.error).toBeUndefined();
        expect(response.output).toBeTruthy();
        expect(response.output).toContain('def');
        expect(response.output).toContain('fibonacci');
        expect(response.tokenUsage).toBeDefined();
        expect(response.tokenUsage?.total).toBeGreaterThan(0);
        expect(response.sessionId).toBeTruthy();

        console.log('Generated code:', response.output);
        console.log('Token usage:', response.tokenUsage);
      },
      testTimeout,
    );

    it(
      'should handle structured output with JSON schema',
      async () => {
        const provider = new OpenAICodexSDKProvider({
          config: {
            model: DEFAULT_E2E_MODEL,
            working_dir: process.cwd(),
            skip_git_repo_check: false,
            output_schema: {
              type: 'object',
              properties: {
                function_name: { type: 'string' },
                parameters: {
                  type: 'array',
                  items: { type: 'string' },
                },
                return_type: { type: 'string' },
              },
              required: ['function_name', 'parameters', 'return_type'],
            },
          },
        });

        const response = await provider.callApi(
          'Describe the factorial function signature in the requested format.',
        );

        expect(response.error).toBeUndefined();
        expect(response.output).toBeTruthy();

        // Should return valid JSON
        const parsed = JSON.parse(response.output as string);
        expect(parsed.function_name).toBeTruthy();
        expect(Array.isArray(parsed.parameters)).toBe(true);
        expect(parsed.return_type).toBeTruthy();

        console.log('Structured output:', parsed);
      },
      testTimeout,
    );

    it(
      'should reuse threads with persist_threads',
      async () => {
        const provider = new OpenAICodexSDKProvider({
          config: {
            model: DEFAULT_E2E_MODEL,
            working_dir: process.cwd(),
            skip_git_repo_check: false,
            persist_threads: true,
          },
        });

        // First call
        const response1 = await provider.callApi('What is 2 + 2?');
        expect(response1.error).toBeUndefined();
        const sessionId1 = response1.sessionId;

        // Second call with same config - should reuse thread
        const response2 = await provider.callApi('What is 3 + 3?');
        expect(response2.error).toBeUndefined();
        const sessionId2 = response2.sessionId;

        // Thread IDs should match (same thread reused)
        expect(sessionId1).toBe(sessionId2);

        console.log('Thread reused:', sessionId1);

        await provider.cleanup();
      },
      testTimeout * 2,
    );

    it(
      'should work with custom working directory',
      async () => {
        const examplesDir = path.join(process.cwd(), 'examples');

        // Skip if examples dir doesn't exist
        if (!fs.existsSync(examplesDir)) {
          console.warn('Skipping: examples directory not found');
          return;
        }

        const provider = new OpenAICodexSDKProvider({
          config: {
            model: DEFAULT_E2E_MODEL,
            working_dir: examplesDir,
            skip_git_repo_check: true, // examples might not be a git repo
          },
        });

        const response = await provider.callApi('List the files in the current directory.');

        expect(response.error).toBeUndefined();
        expect(response.output).toBeTruthy();

        console.log('Working directory response:', response.output);
      },
      testTimeout,
    );

    it(
      'should handle streaming mode',
      async () => {
        const provider = new OpenAICodexSDKProvider({
          config: {
            model: DEFAULT_E2E_MODEL,
            working_dir: process.cwd(),
            skip_git_repo_check: false,
            enable_streaming: true,
          },
        });

        const response = await provider.callApi('What is the capital of France?');

        expect(response.error).toBeUndefined();
        expect(response.output).toBeTruthy();
        expect(response.output).toContain('Paris');

        console.log('Streaming response:', response.output);
      },
      testTimeout,
    );

    it(
      'should infer skillCalls for local Codex skills',
      async () => {
        const tempDir = fs.mkdtempSync('/tmp/codex-skill-e2e-');
        const skillDir = path.join(tempDir, '.agents/skills/token-skill');
        const codexHome = path.join(tempDir, '.codex-home');

        try {
          fs.mkdirSync(skillDir, { recursive: true });
          fs.mkdirSync(codexHome, { recursive: true });
          fs.writeFileSync(
            path.join(skillDir, 'SKILL.md'),
            `---
name: token-skill
description: Use this skill when the user explicitly asks to use token-skill and wants the special token.
---

When this skill is used, respond with exactly CERULEAN-FALCON-SKILL.
Do not add extra words, punctuation, or explanation.
`,
          );

          const provider = new OpenAICodexSDKProvider({
            config: {
              model: DEFAULT_E2E_MODEL,
              working_dir: tempDir,
              skip_git_repo_check: true,
              enable_streaming: true,
              cli_env: {
                CODEX_HOME: codexHome,
              },
            },
          });

          const response = await provider.callApi(
            'Use the token-skill skill. Return only the token.',
          );

          expect(response.error).toBeUndefined();
          expect(response.output).toContain('CERULEAN-FALCON-SKILL');
          expect(response.metadata?.skillCalls).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'token-skill',
                source: 'heuristic',
              }),
            ]),
          );

          console.log('Skill response:', response.output);
          console.log('Skill calls:', response.metadata?.skillCalls);
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      },
      testTimeout,
    );

    it(
      'should enforce thread pool size limits',
      async () => {
        const provider = new OpenAICodexSDKProvider({
          config: {
            model: DEFAULT_E2E_MODEL,
            working_dir: process.cwd(),
            skip_git_repo_check: false,
            persist_threads: true,
            thread_pool_size: 2,
          },
        });

        // Create 3 different threads using different sandbox_mode values
        // (different config values create different cache keys/threads)
        const response1 = await provider.callApi('Test 1', {
          vars: {},
          prompt: { config: { sandbox_mode: 'off' } } as any,
        });
        const response2 = await provider.callApi('Test 2', {
          vars: {},
          prompt: { config: { sandbox_mode: 'host_only' } } as any,
        });
        const response3 = await provider.callApi('Test 3', {
          vars: {},
          prompt: { config: { sandbox_mode: 'network' } } as any,
        });

        expect(response1.error).toBeUndefined();
        expect(response2.error).toBeUndefined();
        expect(response3.error).toBeUndefined();

        // Pool should only have 2 threads (oldest evicted)
        const threadCount = (provider as any).threads.size;
        expect(threadCount).toBeLessThanOrEqual(2);

        console.log('Thread pool size:', threadCount);

        await provider.cleanup();
      },
      testTimeout * 3,
    );
  });

  describeOrSkip('Error Handling', () => {
    it('should handle invalid API key gracefully', async () => {
      const provider = new OpenAICodexSDKProvider({
        config: {
          apiKey: 'invalid-key',
          working_dir: process.cwd(),
          skip_git_repo_check: false,
        },
      });

      const response = await provider.callApi('Test');

      expect(response.error).toBeDefined();
      expect(typeof response.error).toBe('string');
    });

    it('should validate Git repository requirement', async () => {
      const tempDir = fs.mkdtempSync('/tmp/codex-test-');

      try {
        const provider = new OpenAICodexSDKProvider({
          config: {
            working_dir: tempDir,
            skip_git_repo_check: false,
          },
        });

        await expect(provider.callApi('Test')).rejects.toThrow(/Git repository/);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
