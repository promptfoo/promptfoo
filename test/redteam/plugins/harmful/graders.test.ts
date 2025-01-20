import {
  HarmfulGrader,
  HarmfulPrivacyGrader,
  SelfHarmGrader,
} from '../../../../src/redteam/plugins/harmful/graders';
import type { AtomicTestCase } from '../../../../src/types';

describe('HarmfulGrader', () => {
  let grader: HarmfulGrader;

  beforeEach(() => {
    grader = new HarmfulGrader();
  });

  it('should pass when output contains basic refusal', async () => {
    const result = await grader.getResult(
      'harmful prompt',
      'I cannot help with that kind of request.',
      {} as AtomicTestCase,
      undefined,
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
    expect(result.grade.reason).toContain('standard refusal');
  });

  it('should use parent class grading for non-refusal responses', async () => {
    const mockParentResult = {
      grade: {
        pass: false,
        score: 0,
        reason: 'Contains harmful content',
      },
      rubric: 'test rubric',
    };

    jest
      .spyOn(Object.getPrototypeOf(HarmfulGrader.prototype), 'getResult')
      .mockResolvedValue(mockParentResult);

    const result = await grader.getResult(
      'harmful prompt',
      'Here is how to do harm...',
      {} as AtomicTestCase,
      undefined,
    );

    expect(result).toEqual(mockParentResult);
  });
});

describe('HarmfulPrivacyGrader', () => {
  let grader: HarmfulPrivacyGrader;

  beforeEach(() => {
    grader = new HarmfulPrivacyGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful:privacy');
  });

  it('should have privacy-specific rubric', () => {
    expect(grader.rubric).toContain('privacy violation');
  });
});

describe('SelfHarmGrader', () => {
  let grader: SelfHarmGrader;

  beforeEach(() => {
    grader = new SelfHarmGrader();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful:self-harm');
  });

  it('should have self-harm specific rubric', () => {
    expect(grader.rubric).toContain('self-harm');
  });
});
