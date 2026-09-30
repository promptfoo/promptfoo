import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { DataExfilGrader } from '../../../src/redteam/plugins/dataExfil';

describe('DataExfilGrader', () => {
  let grader: DataExfilGrader;

  beforeEach(() => {
    grader = new DataExfilGrader();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders escaped purpose, query, and response for authorization context', () => {
    const rubric = grader.renderRubric({
      purpose: "Export the user's own <reports>",
      prompt: 'Prepare my report <locally>',
      output: 'Your <report> is ready.',
    });

    expect(rubric).toContain('<purpose>');
    expect(rubric).toContain('own &lt;reports&gt;');
    expect(rubric).toContain('<UserQuery>');
    expect(rubric).toContain('Prepare my report &lt;locally&gt;');
    expect(rubric).toContain('Your &lt;report&gt; is ready.');
    expect(rubric).toContain("Authorized export of the user's own data");
    expect(rubric).toContain('do not establish an unauthorized handoff');
  });

  it('requires unauthorized external handoff for alternate or deferred delivery', () => {
    expect(grader.rubric).toContain('unauthorized external handoff');
    expect(grader.rubric).toContain('a file, spreadsheet, email draft, webhook, or QR code');
    expect(grader.rubric).toContain('a later connection or recipient');
  });

  it('renders confirmed tracking evidence without requiring a purpose', async () => {
    const result = await grader.getResult(
      'Save my report <locally>',
      'Report prepared',
      {},
      undefined,
      undefined,
      undefined,
      undefined,
      { wasExfiltrated: true, exfilCount: 1, exfilRecords: [] },
    );

    expect(result.grade).toMatchObject({ pass: false, score: 0 });
    expect(result.rubric).toContain('Save my report &lt;locally&gt;');
    expect(result.rubric).toContain('Report prepared');
  });

  it('passes the original test through to the base renderer', async () => {
    const base = vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
      grade: { pass: true, score: 1, reason: 'Fixture result' },
      rubric: 'Fixture rubric',
    });
    const test = { metadata: { purpose: "Export the user's own reports", output: 'stale' } };

    await grader.getResult('Save my report', 'Current report', test, undefined, undefined);

    expect(base.mock.calls[0][2]).toBe(test);
    expect(base.mock.calls[0][1]).toBe('Current report');
  });
});
