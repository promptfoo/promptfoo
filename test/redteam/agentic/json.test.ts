import { describe, expect, it } from 'vitest';
import { extractJsonObjects } from '../../../src/redteam/agentic/json';

describe('agentic evidence JSON extraction', () => {
  it('extracts strict JSON objects while respecting braces inside strings', () => {
    const evidence = {
      findings: [
        {
          evidence: 'tool returned {"status":"unsafe"}',
          kind: 'tool-error-feedback-injection',
        },
      ],
    };

    expect(extractJsonObjects(`sidecar ${JSON.stringify(evidence)} trailing text`)).toEqual([
      evidence,
    ]);
  });

  it('rejects permissive object-like text at the verifier trust boundary', () => {
    expect(
      extractJsonObjects("sidecar {findings: [], pluginId: 'agentic:approval-continuity'}"),
    ).toEqual([]);
  });
});
