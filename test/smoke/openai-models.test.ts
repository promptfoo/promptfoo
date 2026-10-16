import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import type { EvaluateResult } from '../../src/types/index';

const repoRoot = path.resolve(__dirname, '../..');

describe('OpenAI model CLI smoke tests', () => {
  it('routes GPT-6.1 Sol and bills the returned Ultrafast service tier', async () => {
    const cases = [
      { label: 'sol-responses', id: 'openai:gpt-6.1-sol', cost: 0.000324 },
      { label: 'sol-chat', id: 'openai:chat:gpt-6.1-sol', cost: 0.000324 },
      { label: 'astra-ultrafast', id: 'openai:gpt-6-astra', cost: 0.00984 },
      { label: 'astra-fallback', id: 'openai:gpt-6-astra', cost: 0.00164 },
    ];
    const requests: { label: string; url: string; body: Record<string, unknown> }[] = [];
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openai-models-'));
    const server = http.createServer(async (request, response) => {
      let text = '';
      for await (const chunk of request) {
        text += chunk;
      }
      const body = JSON.parse(text);
      const label = String(request.headers['x-smoke-case']);
      requests.push({ label, url: request.url!, body });
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          id: `response-${label}`,
          model: body.model,
          service_tier: label === 'astra-ultrafast' ? 'ultrafast' : 'default',
          ...(request.url === '/v1/chat/completions'
            ? {
                choices: [{ message: { role: 'assistant', content: 'Ready.' } }],
                usage: {
                  prompt_tokens: 100,
                  completion_tokens: 20,
                  total_tokens: 120,
                  prompt_tokens_details: { cached_tokens: 40, cache_write_tokens: 0 },
                },
              }
            : {
                status: 'completed',
                output: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'Ready.' }],
                  },
                ],
                usage: {
                  input_tokens: 100,
                  output_tokens: 20,
                  total_tokens: 120,
                  input_tokens_details: { cached_tokens: 40, cache_write_tokens: 0 },
                },
              }),
        }),
      );
    });

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as { port: number };
      const configPath = path.join(tempDir, 'promptfooconfig.json');
      const outputPath = path.join(tempDir, 'output.json');
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          prompts: ['Say ready.'],
          providers: cases.map(({ id, label }) => ({
            id,
            label,
            config: {
              apiBaseUrl: `http://127.0.0.1:${port}/v1`,
              apiKey: 'smoke-test-key',
              headers: { 'x-smoke-case': label },
              maxRetries: 0,
              ...(label === 'sol-chat'
                ? { reasoning_effort: 'high', max_completion_tokens: 128 }
                : { reasoning: { effort: 'high' }, max_output_tokens: 128 }),
              ...(label.startsWith('astra-') ? { service_tier: 'ultrafast' } : {}),
              temperature: 0.7,
              top_p: 0.8,
              logprobs: true,
              top_logprobs: 2,
            },
          })),
          tests: [{ assert: [{ type: 'equals', value: 'Ready.' }] }],
        }),
      );
      await promisify(execFile)(
        process.execPath,
        [
          path.join(repoRoot, 'dist/src/entrypoint.js'),
          'eval',
          '-c',
          configPath,
          '-o',
          outputPath,
          '--no-cache',
          '--no-share',
          '--no-progress-bar',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            PROMPTFOO_CONFIG_DIR: path.join(tempDir, 'state'),
            PROMPTFOO_DISABLE_TELEMETRY: 'true',
            PROMPTFOO_DISABLE_UPDATE: 'true',
            PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
          },
        },
      );

      const exported = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      expect(exported.results.stats).toMatchObject({ successes: 4, failures: 0, errors: 0 });
      expect(exported.shareableUrl).toBeNull();
      expect(exported.results.results).toHaveLength(cases.length);
      expect(requests).toHaveLength(cases.length);
      for (const { label, cost } of cases) {
        const request = requests.find((entry) => entry.label === label)!;
        const chat = label === 'sol-chat';
        expect(request.url).toBe(chat ? '/v1/chat/completions' : '/v1/responses');
        expect(request.body).toMatchObject({
          model: label.startsWith('sol-') ? 'gpt-6.1-sol' : 'gpt-6-astra',
          ...(chat
            ? { reasoning_effort: 'high', max_completion_tokens: 128 }
            : { reasoning: { effort: 'high' }, max_output_tokens: 128 }),
        });
        expect(request.body.service_tier).toBe(
          label.startsWith('astra-') ? 'ultrafast' : undefined,
        );
        for (const option of ['temperature', 'top_p', 'logprobs', 'top_logprobs']) {
          expect(request.body).not.toHaveProperty(option);
        }
        const result = (exported.results.results as EvaluateResult[]).find(
          (entry) => entry.provider.label === label,
        )!;
        expect(result).toMatchObject({ success: true, score: 1, response: { output: 'Ready.' } });
        expect(result.error).toBeFalsy();
        expect(result.response?.error).toBeUndefined();
        expect(result.response?.cost).toBeCloseTo(cost, 10);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
