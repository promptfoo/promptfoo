import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as yaml from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { createTransformResponse } from '../../src/providers/httpTransforms';

const repoRoot = path.resolve(__dirname, '../..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openapi-responses-'));
let specIndex = 0;
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

type Generated = {
  providers?: { config: { transformResponse: string } }[];
  targets?: { config: { transformResponse: string } }[];
  tests: { assert: { type: string; value?: unknown }[] }[];
};

function generate(
  kind: 'provider' | 'redteam',
  schema: unknown,
  inputs = ['question'],
  args: string[] = [],
  rootResponse = false,
  field = 'answer',
) {
  const specPath = path.join(tempDir, `openapi-${specIndex++}.yaml`);
  fs.writeFileSync(
    specPath,
    yaml.dump({
      openapi: '3.1.0',
      paths: {
        '/status': {
          get: {
            operationId: 'getStatus',
            parameters: inputs.map((name) => ({ in: 'query', name, schema: { type: 'string' } })),
            responses: {
              '200': {
                description: 'Status response',
                content: {
                  'application/json': {
                    schema: rootResponse
                      ? schema
                      : { type: 'object', properties: { [field]: schema } },
                  },
                },
              },
            },
          },
        },
      },
      components: { schemas: { Answer: { type: 'string' } } },
    }),
  );
  const skill = kind === 'provider' ? 'promptfoo-provider-setup' : 'promptfoo-redteam-setup';
  const file =
    kind === 'provider'
      ? 'openapi-operation-to-config.mjs'
      : 'openapi-operation-to-redteam-config.mjs';
  return yaml.load(
    execFileSync(
      process.execPath,
      [
        path.join(repoRoot, 'plugins/promptfoo/skills', skill, 'scripts', file),
        '--spec',
        specPath,
        '--operation-id',
        'getStatus',
        '--base-url-env',
        'STATUS_URL',
        ...(kind === 'redteam' ? ['--smoke-test', 'true'] : []),
        ...args,
      ],
      { encoding: 'utf8' },
    ),
  ) as Generated;
}

describe.each(['provider', 'redteam'] as const)('%s OpenAPI response contract', (kind) => {
  it.each([
    [{ type: 'string' }, 'ready', 42],
    [{ type: 'object' }, { ready: true }, []],
    [{ type: 'array' }, [], {}],
    [{ type: 'number' }, 0, '0'],
    [{ type: 'integer' }, 0, 1.5],
    [{ type: 'boolean' }, false, 'false'],
    [{ type: 'string', nullable: true }, null, false],
    [{ type: ['string', 'null'] }, null, []],
    [{ $ref: '#/components/schemas/Answer' }, 'ready', 42],
    [{ allOf: [{ $ref: '#/components/schemas/Answer' }] }, 'ready', 42],
    [{ oneOf: [{ type: 'string' }, { type: 'boolean' }] }, false, 42],
    [{ anyOf: [{ type: 'string' }, { type: 'boolean' }] }, false, 42],
  ])(
    'accepts the declared JSON type and rejects malformed answers: %j',
    async (schema, good, bad) => {
      const config = generate(kind, schema);
      const provider = (config.providers ?? config.targets)![0];
      const transform = await createTransformResponse(provider.config.transformResponse);
      expect(transform({ answer: good }, JSON.stringify({ answer: good }))).toEqual({
        output: typeof good === 'string' ? good : JSON.stringify(good),
      });
      expect(() => transform({ answer: bad }, JSON.stringify({ answer: bad }))).toThrow('Expected');
      expect(() => transform({}, '{}')).toThrow('Expected');
      expect(() => transform(null, 'null')).toThrow('Expected');
    },
  );

  it.each([
    [{ type: 'number' }, 0, '0'],
    [{ type: 'boolean' }, false, 'false'],
    [{ type: ['string', 'null'] }, null, false],
    [{ type: 'object' }, { ready: true }, []],
    [{ type: 'array' }, [], {}],
  ])('checks root responses without losing falsy JSON values: %j', async (schema, good, bad) => {
    const config = generate(kind, schema, ['question'], [], true);
    const provider = (config.providers ?? config.targets)![0];
    const transform = await createTransformResponse(provider.config.transformResponse);
    expect(transform(good, JSON.stringify(good))).toEqual({ output: JSON.stringify(good) });
    expect(() => transform(bad, JSON.stringify(bad))).toThrow('Expected');
    expect(() => transform(null, 'malformed JSON')).toThrow();
  });

  it.each(['question', 'invoice_id'])(
    'does not infer an echo contract from a %s input',
    (input) => {
      const config = generate(kind, { type: 'object' }, [input]);
      expect(config.tests[0].assert).toEqual([
        { type: 'javascript', value: 'output !== null && output !== undefined' },
      ]);
    },
  );

  it('does not treat inherited properties as response fields', async () => {
    const config = generate(kind, { type: 'object' }, ['question'], [], false, '__proto__');
    const provider = (config.providers ?? config.targets)![0];
    const transform = await createTransformResponse(provider.config.transformResponse);
    expect(() => transform({}, '{}')).toThrow('Expected');
    const body = JSON.parse('{"__proto__":{"ready":true}}');
    expect(transform(body, JSON.stringify(body))).toEqual({ output: '{"ready":true}' });
  });

  it('supports an explicit smoke assertion', () => {
    const config = generate(kind, { type: 'string' }, ['question'], ['--smoke-assert', 'PONG']);
    expect(config.tests[0].assert).toEqual([{ type: 'contains', value: 'PONG' }]);
  });
});

it.each([{ inputs: [] }, { inputs: ['api_key'] }])(
  'rejects a redteam operation with no controllable request inputs: %j',
  ({ inputs }) => {
    expect(() => generate('redteam', { type: 'string' }, inputs)).toThrow(
      'no controllable request inputs',
    );
  },
);
