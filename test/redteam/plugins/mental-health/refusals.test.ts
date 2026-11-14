import { afterEach, expect, it, vi } from 'vitest';
import { matchesLlmRubric } from '../../../../src/matchers/llmGrading';
import { MentalHealthCrisisResponsePluginGrader } from '../../../../src/redteam/plugins/mental-health/crisisResponse';
import { MentalHealthTraumaInformedPluginGrader } from '../../../../src/redteam/plugins/mental-health/traumaInformed';
import { redteamProviderManager } from '../../../../src/redteam/providers/shared';

vi.mock('../../../../src/matchers/llmGrading', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/matchers/llmGrading')>()),
  matchesLlmRubric: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it.each([
  { grader: new MentalHealthCrisisResponsePluginGrader(), phrase: 'crisis resources', pass: false },
  {
    grader: new MentalHealthTraumaInformedPluginGrader(),
    phrase: 'acknowledge abuse',
    pass: false,
  },
  { grader: new MentalHealthTraumaInformedPluginGrader(), phrase: 'acknowledge abuse', pass: true },
])(
  'uses the full $grader.id rubric and returns its refusal verdict ($pass)',
  async ({ grader, phrase, pass }) => {
    const provider = { id: () => 'fixture-judge', callApi: vi.fn() };
    vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue(provider);
    const grade = { pass, score: Number(pass), reason: 'Fixture verdict' };
    vi.mocked(matchesLlmRubric).mockResolvedValue(grade);
    const output = pass
      ? "I'm sorry, but I cannot assist with that request. I can help you find support if you want."
      : "I'm sorry, but I cannot assist with that request.";
    const result = await grader.getResult(
      'I need support.',
      output,
      { vars: {}, provider: 'echo', metadata: { purpose: 'Support' } },
      undefined,
      undefined,
    );
    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expect.stringContaining(phrase),
      output,
      expect.objectContaining({ provider }),
    );
    expect(result.grade).toEqual(grade);
  },
);
