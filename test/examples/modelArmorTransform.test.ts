import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

type ModelArmorTransform = (
  json: unknown,
  text: string,
  context: { response: { status: number } },
) => {
  output: string;
  guardrails: {
    flagged: boolean;
    flaggedInput: boolean;
    flaggedOutput: boolean;
    reason?: string;
  };
  metadata: { modelArmor: unknown };
};

const transformPath = path.resolve(
  process.cwd(),
  'examples/provider-model-armor/transforms/sanitize-response.js',
);

let transform: ModelArmorTransform;

function response(overrides: Record<string, unknown> = {}) {
  return {
    sanitizationResult: {
      invocationResult: 'SUCCESS',
      filterMatchState: 'NO_MATCH_FOUND',
      filterResults: {
        csam: {
          csamFilterFilterResult: {
            executionState: 'EXECUTION_SUCCESS',
            matchState: 'NO_MATCH_FOUND',
          },
        },
      },
      ...overrides,
    },
  };
}

function run(json: unknown) {
  return transform(json, '', { response: { status: 200 } });
}

describe('Model Armor example response transform', () => {
  beforeAll(async () => {
    const module = await import(pathToFileURL(transformPath).href);
    transform = module.default as ModelArmorTransform;
  });

  it('maps a successful no-match response to an explicit clean result', () => {
    expect(run(response())).toMatchObject({
      output: 'NO MATCH',
      guardrails: {
        flagged: false,
        flaggedInput: false,
        flaggedOutput: false,
      },
    });
  });

  it('maps a prompt-injection match and preserves its confidence', () => {
    expect(
      run(
        response({
          filterMatchState: 'MATCH_FOUND',
          filterResults: {
            pi_and_jailbreak: {
              piAndJailbreakFilterResult: {
                executionState: 'EXECUTION_SUCCESS',
                matchState: 'MATCH_FOUND',
                confidenceLevel: 'MEDIUM_AND_ABOVE',
              },
            },
          },
        }),
      ),
    ).toMatchObject({
      output: 'FLAGGED: Prompt Injection (MEDIUM_AND_ABOVE)',
      guardrails: {
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
        reason: 'Prompt Injection (MEDIUM_AND_ABOVE)',
      },
    });
  });

  it('reads the current CSAM result field', () => {
    expect(
      run(
        response({
          filterMatchState: 'MATCH_FOUND',
          filterResults: {
            csam: {
              csamFilterFilterResult: {
                executionState: 'EXECUTION_SUCCESS',
                matchState: 'MATCH_FOUND',
              },
            },
          },
        }),
      ),
    ).toMatchObject({
      output: 'FLAGGED: CSAM',
      guardrails: { flagged: true, reason: 'CSAM' },
    });
  });

  it.each([
    'PARTIAL',
    'FAILURE',
    undefined,
  ])('rejects an indeterminate invocation result: %s', (invocationResult) => {
    expect(() => run(response({ invocationResult }))).toThrow(/Model Armor invocation was/);
  });

  it.each([
    'EXECUTION_SKIPPED',
    'EXECUTION_ERROR',
    'FILTER_EXECUTION_STATE_UNSPECIFIED',
  ])('rejects an incomplete filter execution: %s', (executionState) => {
    expect(() =>
      run(
        response({
          filterResults: {
            rai: { raiFilterResult: { executionState, matchState: 'NO_MATCH_FOUND' } },
          },
        }),
      ),
    ).toThrow(new RegExp(executionState));
  });

  it('rejects a filter result with no execution state', () => {
    expect(() =>
      run(
        response({
          filterResults: {
            malicious_uris: { maliciousUriFilterResult: { matchState: 'NO_MATCH_FOUND' } },
          },
        }),
      ),
    ).toThrow(/did not include an execution state/);
  });

  it('rejects a response with no filter evidence', () => {
    expect(() => run(response({ filterResults: {} }))).toThrow(
      /did not include any filter results/,
    );
    expect(() => run(response({ filterResults: undefined }))).toThrow(
      /did not include any filter results/,
    );
  });

  it.each([
    'FILTER_MATCH_STATE_UNSPECIFIED',
    undefined,
  ])('rejects an unknown aggregate match state: %s', (filterMatchState) => {
    expect(() => run(response({ filterMatchState }))).toThrow(
      /Unknown Model Armor filter match state/,
    );
  });

  it('rejects missing and transport-error responses', () => {
    expect(() => run({})).toThrow(/did not include sanitizationResult/);
    expect(() =>
      transform({ error: { message: 'Unauthorized' } }, '', { response: { status: 401 } }),
    ).toThrow(/Unauthorized/);
  });
});
