import { describe, expect, it } from 'vitest';
import { extractJsonObjects, parseEvidenceCandidates } from '../../../src/redteam/agentic/json';

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

  it('bounds malformed objects and deeply nested evidence without recursive traversal', () => {
    expect(extractJsonObjects('{'.repeat(2000))).toEqual([]);
    let nested: unknown = { findings: [] };
    for (let index = 0; index < 1100; index++) {
      nested = [nested];
    }
    expect(parseEvidenceCandidates(nested)).toEqual([]);
  });

  it('recovers bounded evidence after malformed text and ignores trailing overflow', () => {
    const evidence = { findings: [{ kind: 'approval-bypass' }] };
    expect(extractJsonObjects(`log: { unfinished ${JSON.stringify(evidence)}`)).toEqual([evidence]);
    expect(extractJsonObjects(`log: { unfinished { second ${JSON.stringify(evidence)}`)).toEqual([
      evidence,
    ]);
    expect(parseEvidenceCandidates(`${JSON.stringify(evidence)}${'x'.repeat(100_000)}`)).toEqual([
      evidence,
    ]);
  });
});
