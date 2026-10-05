import { describe, expect, it } from 'vitest';
import { sanitizeResultForShare } from '../../src/util/evalSharing';

const fixture = {
  testCase: { vars: { password: 'fixture-password', normal: 'keep' } },
  vars: { password: 'fixture-password', normal: 'keep' },
  prompt: { raw: '{ "password": "fixture-password" }', label: 'example' },
  provider: { id: 'echo', config: { apiKey: 'provider-credential' } },
  response: {
    output: '{ "password": "target output is evidence" }',
    metadata: {
      headers: { 'api-key': 'legacy-credential', 'x-request-id': 'request-1' },
      http: {
        headers: { 'set-cookie': 'session=credential', 'content-type': 'application/json' },
        requestHeaders: { Authorization: 'Bearer transport-credential' },
      },
    },
  },
  metadata: { headers: { 'api-key': 'legacy-credential', 'x-request-id': 'user-defined-id' } },
  gradingResult: {
    pass: true,
    score: 1,
    assertion: { type: 'equals', value: '{ "password": "expected fixture" }' },
    componentResults: [
      {
        pass: true,
        score: 1,
        assertion: {
          type: 'llm-rubric',
          value: 'Does it match?',
          provider: { id: 'grader', config: { apiKey: 'grader-credential' } },
          config: { headers: { Authorization: 'grader-header-credential' } },
        },
        metadata: { http: { headers: { 'x-request-id': 'grader-request' } } },
      },
    ],
  },
};

describe('shared eval serialization', () => {
  it('redacts upload copies while preserving local evidence and assertion values', () => {
    const before = structuredClone(fixture);
    const shared = sanitizeResultForShare(fixture);
    expect(shared.testCase.vars.password).toBe('[REDACTED]');
    expect(shared.vars.password).toBe('[REDACTED]');
    expect(shared.vars.normal).toBe('keep');
    expect(shared.prompt.raw).toBe('{"password":"[REDACTED]"}');
    expect(shared.provider.config.apiKey).toBe('[REDACTED]');
    expect(shared.response.metadata.http.headers['set-cookie']).toBe('[REDACTED]');
    expect(shared.response.metadata.http.headers['content-type']).toBe('application/json');
    expect(shared.response.metadata.http.requestHeaders.Authorization).toBe('[REDACTED]');
    expect(shared.response.metadata.headers['api-key']).toBe('[REDACTED]');
    expect(shared.metadata.headers).toEqual({
      'api-key': '[REDACTED]',
      'x-request-id': 'user-defined-id',
    });
    expect(shared.response.output).toBe(fixture.response.output);
    expect(shared.gradingResult.assertion.value).toBe(fixture.gradingResult.assertion.value);
    expect(shared.gradingResult.componentResults[0].assertion.provider.config.apiKey).toBe(
      '[REDACTED]',
    );
    expect(shared.gradingResult.componentResults[0].assertion.config.headers.Authorization).toBe(
      '[REDACTED]',
    );
    expect(shared.gradingResult.componentResults[0].metadata.http.headers['x-request-id']).toBe(
      '[REDACTED]',
    );
    expect(fixture).toEqual(before);
  });
});
