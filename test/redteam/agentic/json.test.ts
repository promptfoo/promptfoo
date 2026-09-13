import { describe, expect, it, vi } from 'vitest';
import { extractJsonObjects, parseEvidenceCandidates } from '../../../src/redteam/agentic/json';

describe('agentic evidence JSON extraction', () => {
  it.each(['agenticEvidence', 'agentSdkEvidence'])(
    'merges both nested aliases when %s is clean',
    (cleanKey) => {
      const clean = { pluginId: 'agentic:tool-discovery-confusion', findings: [] };
      const unsafe = {
        pluginId: 'agentic:tool-discovery-confusion',
        findings: [{ kind: 'tool-discovery-confusion' }],
      };
      const value = { agenticEvidence: unsafe, agentSdkEvidence: unsafe, [cleanKey]: clean };
      expect(parseEvidenceCandidates(value)).toEqual(expect.arrayContaining([clean, unsafe]));
    },
  );

  it.each(['agenticEvidence', 'agentSdkEvidence'])(
    'retains direct findings beside a clean %s envelope',
    (key) => {
      const clean = { pluginId: 'agentic:tool-discovery-confusion', findings: [] };
      const direct = {
        pluginId: clean.pluginId,
        findings: [{ kind: 'tool-discovery-confusion' }],
        [key]: clean,
      };
      expect(parseEvidenceCandidates(direct)).toEqual(expect.arrayContaining([direct, clean]));
    },
  );

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

  it('parses deeply nested mixed-text evidence once instead of reparsing every suffix', () => {
    const payload = 'prefix ' + '{"nested":'.repeat(2000) + '{}' + '}'.repeat(2000);
    const parse = vi.spyOn(JSON, 'parse');
    try {
      expect(extractJsonObjects(payload)).toHaveLength(1);
      expect(parse.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      parse.mockRestore();
    }
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
    expect(() => parseEvidenceCandidates(nested)).toThrow(/evidence.*limit/i);
  });

  it('recovers bounded evidence after malformed text and rejects oversized input', () => {
    const evidence = { findings: [{ kind: 'approval-bypass' }] };
    expect(extractJsonObjects(`log: { unfinished ${JSON.stringify(evidence)}`)).toEqual([evidence]);
    expect(extractJsonObjects(`log: { unfinished { second ${JSON.stringify(evidence)}`)).toEqual([
      evidence,
    ]);
    expect(() =>
      parseEvidenceCandidates(`${JSON.stringify(evidence)}${'x'.repeat(100_000)}`),
    ).toThrow(/evidence.*limit/i);
    expect(() =>
      parseEvidenceCandidates(
        `<AgenticEvidence>${JSON.stringify(evidence)}</AgenticEvidence>${'x'.repeat(100_000)}`,
      ),
    ).toThrow(/evidence.*limit/i);
    expect(() =>
      parseEvidenceCandidates(JSON.stringify({ findings: ['x'.repeat(100_000)] })),
    ).toThrow(/evidence.*limit/i);
  });
});
