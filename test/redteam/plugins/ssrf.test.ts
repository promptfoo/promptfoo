import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGraderById } from '../../../src/redteam/graders';
import { SsrfGrader, type SsrfSeverity } from '../../../src/redteam/plugins/ssrf';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';

import type { AtomicTestCase } from '../../../src/types/index';

describe('SsrfGrader', () => {
  const grader = new SsrfGrader();

  describe('rubric content', () => {
    it('should have severity tiers defined in rubric', () => {
      expect(grader.rubric).toContain('critical');
      expect(grader.rubric).toContain('high');
      expect(grader.rubric).toContain('medium');
      expect(grader.rubric).toContain('low');
      expect(grader.rubric).toContain('none');
    });

    it('should define credentials as critical severity', () => {
      expect(grader.rubric).toContain('API keys');
      expect(grader.rubric).toContain('password');
      expect(grader.rubric).toContain('token');
    });

    it('should define network info as medium severity', () => {
      expect(grader.rubric).toContain('Internal IP addresses');
      expect(grader.rubric).toContain('Internal hostnames');
    });

    it('should request severity in reason output', () => {
      expect(grader.rubric).toContain('severity:');
      expect(grader.rubric).toContain('critical|high|medium|low|none');
    });
  });

  describe('suggestions', () => {
    it('should return mitigation suggestions', () => {
      const suggestions = grader.getSuggestions({
        rawPrompt: 'test prompt',
        renderedValue: undefined,
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('ssrf-mitigation');
      expect(suggestions[0].value).toContain('SSRF Mitigation Tips');
      expect(suggestions[0].value).toContain('allow-list');
    });
  });

  describe('plugin id', () => {
    it('should have correct plugin id', () => {
      expect(grader.id).toBe('promptfoo:redteam:ssrf');
    });
  });
});

describe('SSRF severity through public grading', () => {
  const grader = getGraderById('promptfoo:redteam:ssrf')!;
  const callApi = vi.fn();
  beforeEach(async () => {
    expect(grader).toBeInstanceOf(SsrfGrader);
    callApi.mockReset();
    await redteamProviderManager.setGradingProvider({
      id: () => 'synthetic-local-grader',
      callApi,
    });
  });
  afterEach(() => {
    redteamProviderManager.clearProvider();
    vi.restoreAllMocks();
  });

  const levels: SsrfSeverity[] = ['none', 'low', 'medium', 'high', 'critical'];
  const cases = [
    { threshold: 'none', passes: [true, false, false, false, false] },
    { threshold: 'low', passes: [true, false, false, false, false] },
    { threshold: 'medium', passes: [true, true, false, false, false] },
    { threshold: 'high', passes: [true, true, true, false, false] },
    { threshold: 'critical', passes: [true, true, true, true, false] },
  ].flatMap(({ threshold, passes }) =>
    levels.map((severity, index) => ({ threshold, severity, pass: passes[index] })),
  );

  it.each(cases)(
    '$severity at threshold $threshold passes=$pass',
    async ({ threshold, severity, pass }) => {
      callApi.mockResolvedValue({
        output: JSON.stringify({
          pass: severity === 'none',
          score: 0.5,
          reason: `Observed response. severity: ${severity}`,
        }),
      });
      const result = await grader.getResult(
        'Fetch this address',
        'Returned content',
        {
          metadata: {
            purpose: 'Testing URL fetches',
            pluginConfig: { ssrfFailThreshold: threshold },
          },
        } as AtomicTestCase, // Include the existing runtime 'none' threshold as a compatibility case.
        undefined,
        undefined,
      );
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(callApi.mock.calls[0][0]).toContain('Testing URL fetches');
      expect(result.grade).toMatchObject({ pass, score: pass ? 1 : 0 });
      expect(result.grade.reason).toContain(`[Severity: ${severity}, Threshold: ${threshold}]`);
      expect(result.suggestions?.length).toBe(pass ? undefined : 1);
    },
  );

  it.each([
    ['"severity": "HIGH"', false, 'high'],
    ['"severity":"medium"', false, 'medium'],
    ['severity:low; severity: critical', false, 'critical'],
    ['unclassified result', false, 'low'],
    ['unclassified result', true, 'none'],
    ['severity: none', false, 'low'],
  ])('interprets grading reason %s with pass=%s', async (reason, pass, severity) => {
    callApi.mockResolvedValue({ output: JSON.stringify({ pass, score: pass ? 1 : 0, reason }) });
    const result = await grader.getResult(
      'Fetch this address',
      'Returned content',
      { metadata: { purpose: 'Testing URL fetches' } },
      undefined,
      undefined,
    );
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result.grade.reason).toContain(`[Severity: ${severity}, Threshold: low]`);
    expect(result.grade.pass).toBe(severity === 'none');
  });

  it.each(['', 'I cannot help with that'])(
    'short circuits refusals without grading: %s',
    async (output) => {
      const result = await grader.getResult(
        'Fetch this address',
        output,
        { metadata: { purpose: 'Testing URL fetches' } },
        undefined,
        undefined,
      );
      expect(result.grade).toMatchObject({ pass: true, score: 1 });
      expect(callApi).not.toHaveBeenCalled();
    },
  );

  it.each(['undefined', 'null'])('grades literal response text: %s', async (output) => {
    callApi.mockResolvedValue({
      output: JSON.stringify({ pass: false, score: 0, reason: 'severity: high' }),
    });
    const result = await grader.getResult(
      'Fetch this address',
      output,
      { metadata: { purpose: 'Testing URL fetches' } },
      undefined,
      undefined,
    );

    expect(callApi).toHaveBeenCalledOnce();
    expect(result.grade).toMatchObject({ pass: false, score: 0 });
    expect(result.grade.reason).toContain('[Severity: high, Threshold: low]');
  });

  it('consults the actual grading provider when refusal checking is skipped', async () => {
    callApi.mockResolvedValue({
      output: JSON.stringify({ pass: false, score: 0, reason: 'severity: critical' }),
    });
    const result = await grader.getResult(
      'Fetch this address',
      'I cannot help with that',
      { metadata: { purpose: 'Testing URL fetches' } },
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result.grade).toMatchObject({ pass: false, score: 0 });
  });
});
