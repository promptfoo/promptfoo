import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../src/cliState';
import { evaluate } from '../src/evaluator';
import { runExtensionHook } from '../src/evaluatorHelpers';
import logger from '../src/logger';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';
import { GoogleVideoProvider } from '../src/providers/google/video';
import { HttpProvider } from '../src/providers/http';
import { N8nProvider } from '../src/providers/n8n';
import { OpenClawAgentProvider } from '../src/providers/openclaw/agent';
import { OpenClawToolInvokeProvider } from '../src/providers/openclaw/tools';
import { SlackProvider } from '../src/providers/slack';
import { getLoadedFileMimeType } from '../src/util/file';

import type { ApiProvider, TestSuite } from '../src/types/index';

// These tests intentionally do NOT mock `../src/util/transform`, so every
// transform function flows through the real `transform()` implementation.
// The wiring-level coverage lives in `evaluator.integration.transforms.test.ts`;
// this file verifies behavior end-to-end.

vi.mock('../src/assertions', async () => {
  const actual = await vi.importActual('../src/assertions');
  return {
    ...(actual as any),
    runAssertions: vi.fn().mockResolvedValue({ pass: true, score: 1, namedScores: {} }),
  };
});

vi.mock('../src/cache', () => ({
  getCache: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    wrap: vi.fn((_key: any, fn: any) => fn()),
  })),
  isCacheEnabled: vi.fn(() => true),
  withCacheEnabled: vi.fn(async (_enabled: boolean | undefined, fn: () => Promise<unknown>) =>
    fn(),
  ),
  withCacheNamespace: vi.fn(async (_namespace: string | undefined, fn: () => Promise<unknown>) =>
    fn(),
  ),
}));

vi.mock('../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../src/evaluatorHelpers', async () => {
  const actual = await vi.importActual('../src/evaluatorHelpers');
  return {
    ...(actual as any),
    runExtensionHook: vi.fn((...args: any[]) => args[2]),
  };
});

const makeSuite = (overrides: Partial<TestSuite>): TestSuite => ({
  prompts: [{ raw: 'Hello {{name}}', label: 'Test' }],
  providers: [
    {
      id: () => 'mock-provider',
      callApi: async () => ({
        output: '  spaced output  ',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
      }),
    } as ApiProvider,
  ],
  tests: [{ vars: { name: 'world' } }],
  ...overrides,
});

describe('Transformation integration (real transform)', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  it.each(['agent', 'tool'].flatMap((kind) => [false, true].map((shared) => ({ kind, shared }))))(
    'checks the native OpenClaw $kind configuration (shared=$shared)',
    async ({ kind, shared }) => {
      const options = {
        config: { gateway_url: 'http://127.0.0.1:18789', ...(shared && { session_key: 'shared' }) },
      };
      const provider =
        kind === 'agent'
          ? new OpenClawAgentProvider('main', options)
          : new OpenClawToolInvokeProvider('session_status', options);
      const callApi = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
      const run = evaluate(
        {
          providers: [provider],
          prompts: [{ raw: 'question', label: 'openclaw' }],
          tests: [{}],
        },
        new Eval({}),
        { bayesAtN: true, repeat: 2, cache: false },
      );
      if (shared) {
        await expect(run).rejects.toThrow('shared provider sessions');
        expect(callApi).not.toHaveBeenCalled();
      } else {
        await run;
        expect(callApi).toHaveBeenCalledTimes(2);
        options.config.session_key = 'shared-after-construction';
        await expect(
          evaluate(
            {
              providers: [provider],
              prompts: [{ raw: 'question', label: 'openclaw' }],
              tests: [{}],
            },
            new Eval({}),
            { bayesAtN: true, repeat: 2, cache: false },
          ),
        ).rejects.toThrow('shared provider sessions');
        expect(callApi).toHaveBeenCalledTimes(2);
      }
    },
  );

  it('rejects a native OpenClaw tool pinned through a session header', async () => {
    const provider = new OpenClawToolInvokeProvider('session_status', {
      config: {
        gateway_url: 'http://127.0.0.1:18789',
        headers: { 'X-OpenClaw-Session-Key': 'shared' },
      },
    });
    const callApi = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    await expect(
      evaluate(
        {
          providers: [provider],
          prompts: [{ raw: 'question', label: 'openclaw' }],
          tests: [{}],
        },
        new Eval({}),
        { bayesAtN: true, repeat: 2, cache: false },
      ),
    ).rejects.toThrow('shared provider sessions');
    expect(callApi).not.toHaveBeenCalled();
  });

  it('rejects a native session activated by beforeEach after input preparation', async () => {
    const config = { gateway_url: 'http://127.0.0.1:18789', session_key: '' };
    const provider = new OpenClawAgentProvider('main', { config });
    const callApi = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach') {
        config.session_key = 'shared-after-preparation';
      }
      return context;
    });
    try {
      await expect(
        evaluate(
          {
            providers: [provider],
            prompts: [{ raw: 'question', label: 'openclaw' }],
            tests: [{}],
            extensions: ['test-hook'],
          },
          new Eval({}),
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('shared provider sessions');
      expect(callApi).not.toHaveBeenCalled();
    } finally {
      vi.mocked(runExtensionHook).mockImplementation(
        async (_extensions, _hook, context) => context,
      );
    }
  });

  it.each([
    'provider',
    'prompt',
    'test options',
    'prompt function',
    'target override',
    'grader',
    'typed grader',
    'nested grader',
  ])('binds Bayes@N to native provider input file bytes from %s', async (owner) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-provider-file-'));
    const file = path.join(directory, 'image.png');
    fs.writeFileSync(file, 'original image');
    const config = { basePath: directory, image: 'file://image.png' };
    const isGrader = owner.includes('grader');
    const provider = new GoogleVideoProvider('veo-3.1-generate-preview', {
      id: 'aliased-video',
      config:
        owner === 'provider' || isGrader
          ? config
          : owner === 'prompt function'
            ? { image: 'file://missing-overridden-provider-input.png' }
            : {},
    });
    const callApi = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    const unusedProvider = new GoogleVideoProvider('veo-3.1-generate-preview', {
      id: 'unused-target',
      config: { image: 'file://missing-unused' },
    });
    vi.spyOn(unusedProvider, 'callApi').mockResolvedValue({ output: 'answer' });
    const targetCallApi = isGrader ? vi.fn(async () => ({ output: 'answer' })) : callApi;
    const suite = (): TestSuite => ({
      providers: isGrader
        ? [{ id: () => 'graded-target', callApi: targetCallApi }]
        : owner === 'target override'
          ? [unusedProvider]
          : [provider],
      prompts: [
        {
          raw: 'question',
          label: 'video',
          ...(owner === 'prompt' && { config }),
          ...(owner === 'prompt function' && {
            function: async () => ({ prompt: 'question', config }),
          }),
        },
      ],
      extensions: ['test-hook'],
      tests: [
        {
          ...(owner === 'target override' && { provider }),
          ...((owner === 'test options' || owner === 'target override') && { options: config }),
          ...((owner === 'grader' || owner === 'typed grader') && {
            options: { provider: owner === 'grader' ? provider : { text: provider } },
          }),
          ...(owner === 'nested grader' && {
            assert: [{ type: 'assert-set', assert: [{ type: 'llm-rubric', provider }] }],
          }),
        },
      ],
    });
    try {
      // cliState.basePath deliberately differs from the native media owner.
      const priorBasePath = cliState.basePath;
      cliState.basePath = path.join(directory, 'unused-cli-base');
      const record = new Eval({});
      await evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false });
      const summary = await record.getRepeatStability();
      expect(summary?.bayesAtN?.[0]).toMatchObject({ questions: 1, trials: 2 });
      targetCallApi.mockClear();
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
        if (hook === 'beforeEach') {
          fs.writeFileSync(file, 'changed image');
        }
        return context;
      });
      await expect(
        evaluate(suite(), new Eval({}), { bayesAtN: true, repeat: 2, cache: false }),
      ).rejects.toThrow('unchanged question and grading inputs after beforeEach');
      expect(targetCallApi).not.toHaveBeenCalled();
      cliState.basePath = priorBasePath;
    } finally {
      vi.mocked(runExtensionHook).mockImplementation(
        async (_extensions, _hook, context) => context,
      );
      cliState.basePath = '';
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects changes to prompt-function provider files in beforeEach', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-provider-hook-'));
    const file = path.join(directory, 'image.png');
    fs.writeFileSync(file, 'original image');
    const provider = new GoogleVideoProvider('veo-3.1-generate-preview');
    const callApi = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach') {
        fs.writeFileSync(file, 'changed image');
      }
      return context;
    });
    try {
      await expect(
        evaluate(
          {
            providers: [provider],
            prompts: [
              {
                raw: 'question',
                label: 'video',
                function: async () => ({
                  prompt: 'question',
                  config: { basePath: directory, image: 'file://image.png' },
                }),
              },
            ],
            tests: [{}],
            extensions: ['test-hook'],
          },
          new Eval({}),
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('unchanged question and grading inputs after beforeEach');
      expect(callApi).not.toHaveBeenCalled();
    } finally {
      vi.mocked(runExtensionHook).mockImplementation(
        async (_extensions, _hook, context) => context,
      );
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps custom provider literal file-like config inert without a native file declaration', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    await evaluate(
      {
        providers: [
          { id: () => 'literal-config', config: { image: 'file://not-local/literal' }, callApi },
        ],
        prompts: [{ raw: 'question', label: 'literal' }],
        tests: [{}],
      },
      new Eval({}),
      { bayesAtN: true, repeat: 2, cache: false },
    );
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it('preserves the effective MIME type of freshly prepared repeated file inputs', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-mime-'));
    const bytes = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const observed: Array<string | undefined> = [];
    const callApi = vi.fn(async (_prompt, context) => {
      observed.push(getLoadedFileMimeType(context.vars, context.vars.media));
      return { output: 'answer' };
    });
    try {
      for (const extension of ['m4a', 'mp4']) {
        const file = path.join(directory, `clip.${extension}`);
        fs.writeFileSync(file, bytes);
        await evaluate(
          {
            providers: [
              {
                id: () => 'mime-target',
                getAudioInputFormat: () => 'google',
                callApi,
              } as ApiProvider,
            ],
            prompts: [{ raw: '{{media}}', label: 'media' }],
            tests: [{ vars: { media: `file://${file}` }, options: { disableVarExpansion: true } }],
          },
          new Eval({}),
          { bayesAtN: true, repeat: 2, cache: false },
        );
      }
      expect(observed).toEqual(['audio/mp4', 'audio/mp4', undefined, undefined]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('accepts fresh n8n calls without a shared session ID', async () => {
    const provider = new N8nProvider('https://example.test/webhook');
    const callApi = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    await evaluate(
      { providers: [provider], prompts: [{ raw: 'question', label: 'n8n' }], tests: [{}] },
      new Eval({}),
      { bayesAtN: true, repeat: 2, cache: false },
    );
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it('rejects provider instances with unreported private inputs before generation', async () => {
    class PrivateProvider {
      id() {
        return 'private-provider';
      }
      callApi = vi.fn(async () => ({ output: 'answer' }));
    }
    const provider = new PrivateProvider();
    await expect(
      evaluate(
        { providers: [provider], prompts: [{ raw: 'question', label: 'private' }], tests: [{}] },
        new Eval({}),
        { bayesAtN: true, repeat: 2, cache: false },
      ),
    ).rejects.toThrow('requires getEvaluationInputs for providers with private inputs');
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it.each(['vars', 'prompt function', 'beforeEach'])(
    'rejects n8n conversation reuse from prepared %s before any workflow call',
    async (source) => {
      const provider = new N8nProvider('https://example.test/webhook', { id: 'workflow-alias' });
      const callApi = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
        if (source === 'beforeEach' && hook === 'beforeEach' && 'test' in context) {
          context.test.vars!.sessionId = 'shared';
        }
        return context;
      });
      try {
        await expect(
          evaluate(
            {
              providers: [provider],
              extensions: ['test-hook'],
              prompts: [
                {
                  raw: 'question',
                  label: 'n8n',
                  ...(source === 'prompt function' && {
                    function: async ({ vars }) => {
                      vars.sessionId = 'shared';
                      return 'question';
                    },
                  }),
                },
              ],
              tests: [{ vars: source === 'vars' ? { sessionId: 'shared' } : {} }],
            },
            new Eval({}),
            { bayesAtN: true, repeat: 2, cache: false },
          ),
        ).rejects.toThrow(
          source === 'beforeEach'
            ? 'unchanged question and grading inputs'
            : 'shared provider sessions',
        );
        expect(callApi).not.toHaveBeenCalled();
      } finally {
        vi.mocked(runExtensionHook).mockImplementation(
          async (_extensions, _hook, context) => context,
        );
      }
    },
  );

  it.each(['channel', 'responseStrategy', 'formatMessage', 'threadTs'] as const)(
    'checks Slack private %s before each trial without sending a message',
    async (field) => {
      const config = {
        token: 'dummy-token',
        channel: 'C-original',
        responseStrategy: 'first' as 'first' | 'timeout',
        formatMessage: (prompt: string) => prompt,
        threadTs: '',
      };
      const provider = new SlackProvider({ id: 'slack-alias', config });
      const callApi = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
        if (hook === 'beforeEach') {
          if (field === 'channel') {
            config.channel = 'C-other';
          }
          if (field === 'responseStrategy') {
            config.responseStrategy = 'timeout';
          }
          if (field === 'formatMessage') {
            config.formatMessage = (prompt) => `other ${prompt}`;
          }
          if (field === 'threadTs') {
            config.threadTs = '123.456';
          }
        }
        return context;
      });
      try {
        await expect(
          evaluate(
            {
              providers: [provider],
              extensions: ['test-hook'],
              prompts: [{ raw: 'question', label: 'slack' }],
              tests: [{}],
            },
            new Eval({}),
            { bayesAtN: true, repeat: 2, cache: false },
          ),
        ).rejects.toThrow(
          field === 'threadTs'
            ? 'shared provider sessions'
            : 'unchanged question and grading inputs',
        );
        expect(callApi).not.toHaveBeenCalled();
        expect(provider.getEvaluationInputs().config).not.toHaveProperty('token');
      } finally {
        vi.mocked(runExtensionHook).mockImplementation(
          async (_extensions, _hook, context) => context,
        );
      }
    },
  );

  it.each([false, true])('checks native HTTP multipart file bytes (file URL=%s)', async (asUrl) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-multipart-'));
    const file = path.join(directory, 'payload data.txt');
    fs.writeFileSync(file, 'original');
    const provider = new HttpProvider('https://example.test/upload', {
      config: {
        method: 'POST',
        multipart: {
          parts: [
            {
              kind: 'file',
              name: 'upload',
              source: {
                type: 'path',
                path: asUrl ? `file://${file.replaceAll(' ', '%20')}` : '{{upload}}',
              },
            },
          ],
        },
      },
    });
    const callApi = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach') {
        fs.writeFileSync(file, 'changed');
      }
      return context;
    });
    try {
      await expect(
        evaluate(
          {
            providers: [provider],
            extensions: ['test-hook'],
            prompts: [{ raw: 'question', label: 'multipart' }],
            tests: [{ vars: asUrl ? {} : { upload: file } }],
          },
          new Eval({}),
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('unchanged question and grading inputs');
      expect(callApi).not.toHaveBeenCalled();
    } finally {
      vi.mocked(runExtensionHook).mockImplementation(
        async (_extensions, _hook, context) => context,
      );
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['{{prompt}}', '{% if prompt %}input.txt{% endif %}'])(
    'rejects multipart grader paths requiring a grading-only context: %s',
    async (filePath) => {
      const grader = new HttpProvider('https://example.test/grade', {
        config: {
          method: 'POST',
          multipart: {
            parts: [{ kind: 'file', name: 'upload', source: { type: 'path', path: filePath } }],
          },
        },
      });
      const target = vi.fn(async () => ({ output: 'answer' }));
      const grade = vi.spyOn(grader, 'callApi').mockResolvedValue({ output: 'answer' });
      await expect(
        evaluate(
          {
            providers: [{ id: () => 'graded', callApi: target }],
            prompts: [{ raw: 'question', label: 'multipart-grader' }],
            tests: [{ assert: [{ type: 'llm-rubric', provider: grader, value: 'correct' }] }],
          },
          new Eval({}),
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('dynamic multipart file paths in graders');
      expect(target).not.toHaveBeenCalled();
      expect(grade).not.toHaveBeenCalled();
    },
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('executes an inline function provider.transform', async () => {
    const providerTransformFn = (output: unknown) => String(output).trim().toUpperCase();
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: '  spaced output  ' }),
          transform: providerTransformFn,
        } as ApiProvider,
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(results.results[0].response?.output).toBe('SPACED OUTPUT');
  });

  it('executes an inline function test options.transform', async () => {
    const testTransformFn = (output: unknown) => String(output).toUpperCase();
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: 'hello world' }),
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: { transform: testTransformFn },
        },
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(results.results[0].response?.output).toBe('HELLO WORLD');
  });

  it('executes an inline function transformVars before rendering the prompt', async () => {
    const capturedPrompts: string[] = [];
    const suite = makeSuite({
      prompts: [{ raw: 'Hello {{name}}', label: 'Test' }],
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async (prompt) => {
            capturedPrompts.push(prompt);
            return { output: 'ack' };
          },
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: {
            transformVars: (vars) => ({
              ...(vars as Record<string, unknown>),
              name: String((vars as Record<string, unknown>).name).toUpperCase(),
            }),
          },
        },
      ],
    });

    await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(capturedPrompts).toContain('Hello WORLD');
  });

  it('chains provider.transform then test options.transform', async () => {
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: '  raw  ' }),
          transform: (output: unknown) => String(output).trim(),
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: {
            transform: (output: unknown) => `[${output}]`,
          },
        },
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(results.results[0].response?.output).toBe('[raw]');
  });

  it('marks the row as errored when a function provider transform rejects', async () => {
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: 'anything' }),
          transform: async () => {
            throw new Error('provider transform boom');
          },
        } as ApiProvider,
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    const row = results.results[0];
    expect(row.success).toBe(false);
    expect(row.error ?? '').toContain('provider transform boom');
  });

  it('marks the row as errored when a function test transform throws synchronously', async () => {
    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: 'anything' }),
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: {
            transform: () => {
              throw new Error('test transform boom');
            },
          },
        },
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    const row = results.results[0];
    expect(row.success).toBe(false);
    expect(row.error ?? '').toContain('test transform boom');
  });

  it('chains provider + test + assertion transforms (all functions) end-to-end', async () => {
    const { runAssertions } = await import('../src/assertions');
    const runAssertionsSpy = vi.mocked(runAssertions);
    // Let the assertion runner see the assertion so we can verify its transform executed.
    runAssertionsSpy.mockImplementation(async ({ providerResponse }) => {
      return providerResponse.output === '((  raw  ))'
        ? { pass: true, score: 1, namedScores: {}, reason: 'chain ok' }
        : { pass: false, score: 0, reason: `unexpected: ${providerResponse.output}` };
    });

    const suite = makeSuite({
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({ output: '  raw  ' }),
          // Stage 1 — provider transform wraps with parens.
          transform: (output: unknown) => `(${output})`,
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { name: 'world' },
          options: {
            // Stage 2 — test options transform wraps again.
            transform: (output: unknown) => `(${output})`,
          },
          assert: [
            {
              type: 'contains' as const,
              value: 'raw',
              // Stage 3 — assertion-level transform. Receives the chained output.
              // This is a pure identity — the `runAssertions` mock checks that
              // the post-test-transform value arrived at the assertion layer,
              // which is enough to prove the chain composed.
              transform: (output: unknown) => String(output),
            },
          ],
        },
      ],
    });

    const results = await evaluate(suite, new Eval({}), { maxConcurrency: 1 });
    expect(results.results[0].response?.output).toBe('((  raw  ))');
    // runAssertions received the fully-chained output; its return of pass:true
    // (keyed on the chain output) proves the assertion transform was reached.
    expect(results.results[0].success).toBe(true);
  });

  it.each(['elapsed delay', 'caller cancellation'] as const)(
    'runs a loaded ProviderFunction carrying label, delay, config, and transform: %s',
    async (mode) => {
      // End-to-end coverage that goes through the package-level wiring:
      // loadApiProviders wraps a `ProviderFunction` into an `ApiProvider`, and the
      // evaluator honors every attached metadata field. Mirrors the path a Node.js
      // package user actually hits.
      const { loadApiProviders } = await import('../src/providers/index');

      const providerFn: any = async (prompt: string) => ({
        output: `served:${prompt}`,
      });
      providerFn.label = 'fn-provider-with-metadata';
      providerFn.delay = 250;
      providerFn.config = { custom: 'value' };
      providerFn.transform = (output: unknown) => String(output).toUpperCase();

      const [wrapped] = await loadApiProviders([providerFn]);
      expect(wrapped.id()).toBe('fn-provider-with-metadata');
      expect(wrapped.label).toBe('fn-provider-with-metadata');
      expect(wrapped.delay).toBe(250);
      expect(wrapped.config).toEqual({ custom: 'value' });
      expect(wrapped.transform).toBe(providerFn.transform);

      let notifyDelayStarted!: () => void;
      const delayStarted = new Promise<void>((resolve) => {
        notifyDelayStarted = resolve;
      });
      vi.mocked(logger.debug).mockImplementation((message) => {
        if (message === 'Sleeping for 250ms') {
          notifyDelayStarted();
        }
      });
      const caller = new AbortController();
      const abortReason = new Error('cancel the loaded provider delay');
      let evaluation: ReturnType<typeof evaluate> | undefined;
      let settled = false;
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        evaluation = evaluate(
          {
            prompts: [{ raw: 'hi {{name}}', label: 'p' }],
            providers: [wrapped],
            tests: [{ vars: { name: 'world' } }],
          } as TestSuite,
          new Eval({}),
          { maxConcurrency: 1, abortSignal: caller.signal, timeoutMs: -1, maxEvalTimeMs: 0 },
        );
        void evaluation.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
        await Promise.race([
          delayStarted,
          evaluation.then(() => {
            throw new Error('Evaluation completed before its provider delay');
          }),
        ]);
        await vi.advanceTimersByTimeAsync(249);
        expect(settled).toBe(false);
        if (mode === 'caller cancellation') {
          caller.abort(abortReason);
          expect(caller.signal.reason).toBe(abortReason);
        } else {
          await vi.advanceTimersByTimeAsync(1);
        }
        const results = await evaluation;
        // The real delay either elapses or is cancelled without losing the completed output.
        expect(results.results).toHaveLength(1);
        expect(results.results[0].response?.output).toBe('SERVED:HI WORLD');
      } finally {
        caller.abort(abortReason);
        await evaluation?.catch(() => undefined);
        vi.mocked(logger.debug).mockReset();
        vi.useRealTimers();
      }
    },
  );
});
