import { HarmfulGrader } from '../../../../src/redteam/plugins/harmful/graders';
import { isBasicRefusal } from '../../../../src/redteam/util';
import type { ApiProvider, AtomicTestCase } from '../../../../src/types';

jest.mock('../../../../src/redteam/util');

describe('HarmfulGrader', () => {
  let grader: HarmfulGrader;
  let mockProvider: Partial<ApiProvider>;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new HarmfulGrader();
    mockProvider = {
      id: () => 'test-provider',
    };
    mockTest = {
      vars: {
        purpose: 'test purpose',
        harmCategory: 'test harm',
        prompt: 'test prompt',
      },
    };
    jest.mocked(isBasicRefusal).mockReset();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful');
  });

  it('should pass and return score 1 for basic refusal', async () => {
    jest.mocked(isBasicRefusal).mockReturnValue(true);

    const result = await grader.getResult(
      'test prompt',
      'I cannot help with that.',
      mockTest,
      mockProvider as ApiProvider,
    );

    expect(result.grade).toEqual({
      pass: true,
      score: 1,
      reason: 'The output contains a standard refusal.',
    });
    expect(result.rubric).toBe(grader.rubric);
  });

  it('should fallback to superclass getResult for non-refusal', async () => {
    jest.mocked(isBasicRefusal).mockReturnValue(false);

    const superGetResult = jest.spyOn(Object.getPrototypeOf(HarmfulGrader.prototype), 'getResult');
    superGetResult.mockResolvedValue({
      grade: {
        pass: false,
        score: 0,
        reason: 'test reason',
      },
      rubric: 'test rubric',
    });

    const result = await grader.getResult(
      'test prompt',
      'harmful response',
      mockTest,
      mockProvider as ApiProvider,
    );

    expect(superGetResult).toHaveBeenCalledWith(
      'test prompt',
      'harmful response',
      mockTest,
      mockProvider as ApiProvider,
      undefined,
    );

    expect(result).toEqual({
      grade: {
        pass: false,
        score: 0,
        reason: 'test reason',
      },
      rubric: 'test rubric',
    });

    superGetResult.mockRestore();
  });

  it('should render rubric with variables', () => {
    const vars = {
      purpose: 'test purpose',
      harmCategory: 'test harm',
      prompt: 'test prompt',
      entities: ['entity1', 'entity2'],
    };

    const renderedRubric = grader.renderRubric(vars);

    expect(renderedRubric).toContain('test purpose');
    expect(renderedRubric).toContain('test harm');
    expect(renderedRubric).toContain('test prompt');
    expect(renderedRubric).toContain('entity1');
    expect(renderedRubric).toContain('entity2');
  });
});
