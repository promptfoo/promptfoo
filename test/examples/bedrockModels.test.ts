import fs from 'node:fs';
import path from 'node:path';

import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { runAssertions } from '../../src/assertions';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock/index';
import { UnifiedConfigSchema } from '../../src/types';
import { resolveConfigs } from '../../src/util/config/load';

import type { AtomicTestCase } from '../../src/types';

vi.mock('../../src/telemetry');

afterEach(() => {
  vi.restoreAllMocks();
  cliState.config = undefined;
  cliState.selectedProviderConfigs = undefined;
  cliState.basePath = undefined;
});

function readExample(filename: string) {
  return UnifiedConfigSchema.parse(
    parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../examples/amazon-bedrock/models', filename),
        'utf8',
      ),
    ),
  );
}

describe('Bedrock model examples', () => {
  it.each(['nova', 'deepseek', 'nova.multimodal'])(
    'serializes the configured request in the %s example',
    async (example) => {
      const { config, testSuite } = await resolveConfigs(
        {
          config: [
            path.resolve(
              __dirname,
              '../../examples/amazon-bedrock/models',
              `promptfooconfig.${example}.yaml`,
            ),
          ],
        },
        {},
      );
      testSuite.tests = testSuite.tests?.slice(0, 1);
      const handle = vi.fn(async (_request: { body?: unknown }) => ({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: new TextEncoder().encode(
            JSON.stringify({
              output: { message: { role: 'assistant', content: [{ text: 'A cat is pictured.' }] } },
              choices: [{ text: 'A short tweet.' }],
              usage: { inputTokens: 10, outputTokens: 5 },
            }),
          ),
        },
      }));
      const client = new BedrockRuntime({
        region: 'us-east-1',
        credentials: { accessKeyId: 'LOCAL_FIXTURE', secretAccessKey: 'LOCAL_FIXTURE' },
        maxAttempts: 1,
        requestHandler: { handle },
      });
      vi.spyOn(AwsBedrockCompletionProvider.prototype, 'getBedrockInstance').mockResolvedValue(
        client,
      );
      try {
        const evaluation = new Eval(config);
        await evaluate(testSuite, evaluation, { cache: false, maxConcurrency: 1 });
        const summary = await evaluation.toEvaluateSummary();
        expect(summary.stats).toMatchObject({
          successes: testSuite.providers.length,
          failures: 0,
          errors: 0,
        });
        expect(handle).toHaveBeenCalledTimes(testSuite.providers.length);
        for (const [request] of handle.mock.calls) {
          const body = JSON.parse(String(request.body));
          if (example === 'deepseek') {
            expect(body).toMatchObject({ temperature: 0.7, max_tokens: 4096 });
          } else {
            expect(body.inferenceConfig).toMatchObject({ temperature: 0.7, max_new_tokens: 256 });
          }
          if (example === 'nova.multimodal') {
            expect(body.messages[0].content[0].image).toEqual({
              format: 'jpeg',
              source: {
                bytes: fs
                  .readFileSync(
                    path.resolve(__dirname, '../../examples/amazon-bedrock/models/cat.jpg'),
                  )
                  .toString('base64'),
              },
            });
          }
        }
      } finally {
        client.destroy();
      }
    },
  );

  it.each([
    'promptfooconfig.inference-profiles.yaml',
    'promptfooconfig.inference-profiles-simple.yaml',
  ])('uses supported assertions in %s', (filename) => {
    expect(() => readExample(filename)).not.toThrow();
  });

  it.each([
    ['valid tool arguments', { name: 'color_json', input: { name: 'sky', color: 'blue' } }, true],
    ['normalized name', { name: 'color_json', input: { name: ' SKY ', color: 'blue' } }, true],
    ['wrong name', { name: 'color_json', input: { name: 'banana', color: 'blue' } }, false],
    ['missing name', { name: 'color_json', input: { color: 'blue' } }, false],
    ['missing color', { name: 'color_json', input: { name: 'sky' } }, false],
    ['wrong color', { name: 'color_json', input: { name: 'sky', color: 'red' } }, false],
    ['plain text', 'The sky is blue.', false],
  ] as const)('grades %s without a transform error', async (_name, output, pass) => {
    const config = readExample('promptfooconfig.nova.tool.yaml');
    const result = await runAssertions({
      test: {
        ...(config.defaultTest as AtomicTestCase),
        vars: { topic: 'sky', expectedColor: 'blue' },
      },
      providerResponse: { output: typeof output === 'string' ? output : JSON.stringify(output) },
    });
    expect(result.pass).toBe(pass);
    expect(result.score).toBe(pass ? 1 : 0);
  });
});
