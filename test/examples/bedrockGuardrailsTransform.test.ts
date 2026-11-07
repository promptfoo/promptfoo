import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import type { ProviderResponse } from '../../src/types/index';

const transformPath = path.resolve(
  process.cwd(),
  'examples/provider-bedrock-guardrails/transforms/guardrail-response.js',
);

let transform: (json: unknown) => ProviderResponse;

describe('Bedrock Guardrails example response transform', () => {
  beforeAll(async () => {
    const module = await import(pathToFileURL(transformPath).href);
    transform = module.default;
  });

  it('maps NONE to an allowed input and preserves the assessment', () => {
    const response = { action: 'NONE', assessments: [], usage: { wordPolicyUnits: 1 } };

    expect(transform(response)).toEqual({
      output: 'ALLOWED',
      guardrails: {
        flagged: false,
        flaggedInput: false,
        flaggedOutput: false,
        reason: '',
      },
      metadata: { bedrockGuardrails: response },
    });
  });

  it('maps an intervention to a flagged input and preserves the assessment', () => {
    const response = {
      action: 'GUARDRAIL_INTERVENED',
      outputs: [{ text: 'Input blocked.' }],
      assessments: [{ wordPolicy: { customWords: [{ action: 'BLOCKED' }] } }],
    };

    expect(transform(response)).toEqual({
      output: 'Input blocked.',
      guardrails: {
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
        reason: 'Input blocked.',
      },
      metadata: { bedrockGuardrails: response },
    });
  });

  it.each([{}, { outputs: [] }])(
    'keeps an intervention flagged when output text is unavailable: %j',
    (overrides) => {
      expect(transform({ action: 'GUARDRAIL_INTERVENED', ...overrides })).toMatchObject({
        output: 'BLOCKED',
        guardrails: {
          flagged: true,
          flaggedInput: true,
          flaggedOutput: false,
          reason: 'Content flagged by Bedrock Guardrails',
        },
      });
    },
  );

  it.each([
    { action: 'UNKNOWN' },
    {},
    { message: 'Access denied', __type: 'AccessDeniedException' },
  ])('rejects an unknown or error payload instead of allowing it: %j', (response) => {
    expect(() => transform(response)).toThrow('Invalid ApplyGuardrail response');
  });

  it.each([null, undefined])('rejects an absent payload: %s', (response) => {
    expect(() => transform(response)).toThrow();
  });
});
