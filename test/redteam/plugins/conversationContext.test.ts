import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesLlmRubric } from '../../../src/matchers/llmGrading';
import { CoppaGrader } from '../../../src/redteam/plugins/compliance/coppa';
import { FerpaGrader } from '../../../src/redteam/plugins/compliance/ferpa';
import { WordplayGrader } from '../../../src/redteam/plugins/wordplay';

import type { AtomicTestCase } from '../../../src/types/index';

vi.mock('../../../src/matchers/llmGrading', () => ({
  matchesLlmRubric: vi.fn(),
}));

const conversationTranscript = JSON.stringify([
  { role: 'user', content: 'Earlier user-supplied context: rowan@example.com.' },
  { role: 'assistant', content: 'Acknowledged.' },
]);
const testCase: AtomicTestCase = { metadata: { purpose: 'Test assistant' } };
const grade = { pass: false, score: 0, reason: 'External grading result' };

describe.each([
  {
    name: 'COPPA',
    Grader: CoppaGrader,
    refusalReason: 'The output contains a standard refusal.',
  },
  {
    name: 'FERPA',
    Grader: FerpaGrader,
    refusalReason: 'The output contains a standard refusal to disclose student information.',
  },
  {
    name: 'wordplay',
    Grader: WordplayGrader,
    refusalReason: 'The output contains a standard refusal to engage with the wordplay trap.',
  },
])('$name conversation context', ({ Grader, refusalReason }) => {
  beforeEach(() => {
    vi.mocked(matchesLlmRubric).mockReset();
    vi.mocked(matchesLlmRubric).mockResolvedValue(grade);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('includes opted-in prior turns in the actual grading rubric', async () => {
    const result = await new Grader().getResult(
      'Current request',
      'Actual target response',
      testCase,
      undefined,
      { purpose: 'Ignored assertion purpose' },
      'Ignored additional rubric',
      undefined,
      { conversationTranscript, includeConversationTranscript: true },
    );

    expect(matchesLlmRubric).toHaveBeenCalledExactlyOnceWith(
      result.rubric,
      'Actual target response',
      expect.any(Object),
    );
    expect(result.grade).toEqual(grade);
    expect(result.rubric.match(/<ConversationHistory>/g)).toHaveLength(1);
    expect(result.rubric).toContain(
      '&quot;role&quot;:&quot;user&quot;,&quot;content&quot;:&quot;Earlier user-supplied context: rowan@example.com.',
    );
    expect(result.rubric).toContain(
      '&quot;role&quot;:&quot;assistant&quot;,&quot;content&quot;:&quot;Acknowledged.',
    );
    expect(result.rubric).not.toContain('Ignored assertion purpose');
    expect(result.rubric).not.toContain('Ignored additional rubric');
  });

  it.each([undefined, false])(
    'omits prior turns without opt-in (%s)',
    async (includeConversationTranscript) => {
      const result = await new Grader().getResult(
        'Current request',
        'Actual target response',
        testCase,
        undefined,
        undefined,
        undefined,
        undefined,
        { conversationTranscript, includeConversationTranscript },
      );

      expect(matchesLlmRubric).toHaveBeenCalledExactlyOnceWith(
        result.rubric,
        'Actual target response',
        expect.any(Object),
      );
      expect(result.rubric).not.toContain('<ConversationHistory>');
      expect(result.rubric).not.toContain('rowan@example.com');
    },
  );

  it.each([undefined, true])(
    'preserves the existing refusal shortcut with context opt-in %s',
    async (includeConversationTranscript) => {
      const grader = new Grader();
      const result = await grader.getResult(
        'Current request',
        "I can't help with that request.",
        {},
        undefined,
        undefined,
        'Ignored additional rubric',
        true,
        { conversationTranscript, includeConversationTranscript },
      );

      expect(result).toEqual({
        grade: { pass: true, score: 1, reason: refusalReason },
        rubric: grader.rubric,
      });
      expect(matchesLlmRubric).not.toHaveBeenCalled();
    },
  );

  it('continues to ignore skipRefusalCheck when the base handles empty output', async () => {
    const result = await new Grader().getResult(
      'Current request',
      '',
      testCase,
      undefined,
      undefined,
      undefined,
      true,
      { conversationTranscript, includeConversationTranscript: true },
    );

    expect(result.grade).toEqual({ pass: true, score: 1, reason: 'Model refused the request' });
    expect(result.rubric).toContain('<ConversationHistory>');
    expect(matchesLlmRubric).not.toHaveBeenCalled();
  });
});
