import { describe, expect, it, vi } from 'vitest';
import { extractJsonObjects, parseEvidenceCandidates } from '../../../src/redteam/agentic/json';

describe('agentic evidence JSON extraction', () => {
  it.each([' active ', ' promptfoo:redteam:active ', 'promptfoo:redteam: active'])(
    'normalizes nested scope %j',
    (pluginId) => {
      expect(parseEvidenceCandidates({ pluginId, agenticEvidence: { findings: [] } })).toEqual([
        { pluginId: 'active', findings: [] },
      ]);
      expect(parseEvidenceCandidates({ pluginId, findings: [] })).toEqual([
        { pluginId: 'active', findings: [] },
      ]);
    },
  );

  it.each([
    'sidecar <AgenticEvidence>{"pluginId":"other","findings":[]}</AgenticEvidence>',
    'sidecar {"pluginId":"other","findings":[]} trailing label',
    'sidecar [{"pluginId":"other","findings":[]}] trailing label',
    '[INFO] sidecar <AgenticEvidence>{"pluginId":"other","findings":[]}</AgenticEvidence>',
    'sidecar {"pluginId":"other","findings":[],"label":"<AgenticEvidence>"}',
  ])('does not turn labels around valid mixed evidence into inherited errors: %s', (payload) => {
    expect(
      parseEvidenceCandidates(
        { pluginId: 'active', agenticEvidence: payload },
        { preserveInvalid: true },
      ),
    ).toEqual([expect.objectContaining({ pluginId: 'other', findings: [] })]);
  });
  it.each([
    '[{"pluginId":"other","findings":[]}, null',
    '{"agenticEvidence":{"pluginId":"other","findings":[]}, "broken":',
    '<AgenticEvidence>[{"pluginId":"other","findings":[]}, null</AgenticEvidence>',
    '<AgenticEvidence>{"pluginId":"other","findings":[]}</AgenticEvidence><AgenticEvidence>null',
    '<AgenticEvidence>{"pluginId":"other","findings":[]}</AgenticEvidence><AgentSdkEvidence>broken',
    'sidecar {"pluginId":"other","findings":[]} [',
  ])('preserves inherited scope after partially extracting malformed JSON: %s', (payload) => {
    expect(
      parseEvidenceCandidates(
        { pluginId: 'active', agenticEvidence: payload },
        { preserveInvalid: true },
      ),
    ).toEqual(
      expect.arrayContaining([{ pluginId: 'active' }, { pluginId: 'other', findings: [] }]),
    );
  });

  it.each([42, null, false, '', '   ', {}, []])(
    'retains inherited scope for malformed plugin ID %j',
    (pluginId) => {
      const finding = { kind: 'unsafe' };
      expect(
        parseEvidenceCandidates({
          pluginId: 'active',
          agenticEvidence: { pluginId, agentSdkEvidence: { findings: [finding] } },
        }),
      ).toEqual([{ pluginId: 'active', findings: [finding] }]);
      expect(
        parseEvidenceCandidates({
          pluginId: 'active',
          agenticEvidence: { pluginId, findings: [finding] },
        }),
      ).toEqual([{ pluginId: 'active', findings: [finding] }]);
    },
  );
  it.each([null, '', true, [], { agenticEvidence: null }, '<AgenticEvidence></AgenticEvidence>'])(
    'preserves inherited scope for malformed branches when checking verifier status: %j',
    (malformed) => {
      const other = { pluginId: 'other', findings: [] };
      const value = { pluginId: 'active', agenticEvidence: JSON.stringify([other, malformed]) };
      expect(parseEvidenceCandidates(value, { preserveInvalid: true })).toEqual([
        other,
        { pluginId: 'active' },
      ]);
    },
  );

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

  it.each(['objects', 'serialized-array', 'serialized-entries'])(
    'accepts 1000 decoded candidates from %s',
    (format) => {
      const candidates = Array.from({ length: 1000 }, () => ({ findings: [] }));
      const payload =
        format === 'objects'
          ? candidates
          : format === 'serialized-array'
            ? JSON.stringify(candidates)
            : candidates.map((candidate) => JSON.stringify(candidate));
      expect(parseEvidenceCandidates(payload)).toEqual(candidates);
    },
  );

  it('bounds malformed objects and deeply nested evidence without recursive traversal', () => {
    expect(extractJsonObjects('{'.repeat(2000))).toEqual([]);
    let nested: unknown = { findings: [] };
    for (let index = 0; index < 4100; index++) {
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
