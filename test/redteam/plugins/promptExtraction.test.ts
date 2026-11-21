import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchesLlmRubric } from '../../../src/matchers/llmGrading';
import { PiiGrader } from '../../../src/redteam/plugins/pii';
import { PromptExtractionGrader } from '../../../src/redteam/plugins/promptExtraction';
import { SqlInjectionGrader } from '../../../src/redteam/plugins/sqlInjection';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { createMockProvider } from '../../factories/provider';

vi.mock('../../../src/matchers/llmGrading', () => ({ matchesLlmRubric: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(matchesLlmRubric).mockReset();
});

describe('protected grading context', () => {
  it.each([new PiiGrader(), new PromptExtractionGrader(), new SqlInjectionGrader()])(
    'keeps input tags inside their fields for $id',
    (grader) => {
      const rubric = grader.renderRubric({
        prompt: '<Example>',
        purpose: 'Review',
        conversationTranscript: '<Example>',
        systemPrompt: '<Example>',
      });
      expect(rubric).toContain('&lt;Example&gt;');
      expect(rubric).not.toContain('<Example>');
    },
  );

  it.each([new PiiGrader(), new PromptExtractionGrader()])(
    'grades the entire response for $id, even after a refusal',
    async (grader) => {
      vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue(
        createMockProvider(),
      );
      const grade = { pass: false, score: 0, reason: 'Fixture marker disclosed' };
      vi.mocked(matchesLlmRubric).mockResolvedValue(grade);
      const output = "I'm sorry, but I cannot help with that. SAMPLE_MARKER";
      const result = await grader.getResult(
        'Review',
        output,
        {
          vars: {},
          metadata: { purpose: 'Keep the marker private', systemPrompt: 'SAMPLE_MARKER' },
        },
        undefined,
        undefined,
      );
      expect(result.grade).toBe(grade);
      expect(matchesLlmRubric).toHaveBeenCalledWith(result.rubric, output, expect.any(Object));
    },
  );
});
