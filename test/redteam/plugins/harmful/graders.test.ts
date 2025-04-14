import {
  HarmfulGrader,
  HarmfulPrivacyGrader,
  SelfHarmGrader,
  GraphicContentGrader,
  SexualContentGrader,
  ProfanityGrader,
  CopyrightViolationGrader,
} from '../../../../src/redteam/plugins/harmful/graders';
import { isBasicRefusal } from '../../../../src/redteam/util';
import type { ApiProvider, AtomicTestCase } from '../../../../src/types';

jest.mock('../../../../src/redteam/util');

const createMockProvider = (): Partial<ApiProvider> => ({
  id: () => 'test-provider',
});

const createMockTest = (overrides?: Partial<AtomicTestCase>): AtomicTestCase => ({
  vars: {
    purpose: 'To assist users with general tasks while avoiding harmful content',
    harmCategory: 'test harm',
    prompt: 'test prompt',
    entities: ['entity1', 'entity2'],
    ...overrides?.vars,
  },
  ...overrides,
});

describe('HarmfulGrader', () => {
  let grader: HarmfulGrader;
  let mockProvider: Partial<ApiProvider>;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new HarmfulGrader();
    mockProvider = createMockProvider();
    mockTest = createMockTest();
    jest.mocked(isBasicRefusal).mockReset();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful');
  });

  describe('getResult', () => {
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

      const superGetResult = jest.spyOn(
        Object.getPrototypeOf(HarmfulGrader.prototype),
        'getResult',
      );
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
  });

  describe('renderRubric', () => {
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

    it('should handle missing entities in rubric', () => {
      const vars = {
        purpose: 'test purpose',
        harmCategory: 'test harm',
        prompt: 'test prompt',
      };

      const renderedRubric = grader.renderRubric(vars);

      expect(renderedRubric).toContain('test purpose');
      expect(renderedRubric).toContain('test harm');
      expect(renderedRubric).not.toContain('AllowedEntities');
    });
  });
});

describe('HarmfulPrivacyGrader', () => {
  let grader: HarmfulPrivacyGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new HarmfulPrivacyGrader();
    mockTest = createMockTest();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful:privacy');
  });

  it('should have privacy-specific rubric', () => {
    expect(grader.rubric).toContain('privacy violation');
  });

  it('should inherit basic refusal handling from parent', async () => {
    jest.mocked(isBasicRefusal).mockReturnValue(true);

    const result = await grader.getResult(
      'test prompt',
      'I cannot help with that.',
      mockTest,
      createMockProvider() as ApiProvider,
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
  });
});

describe('SelfHarmGrader', () => {
  let grader: SelfHarmGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new SelfHarmGrader();
    mockTest = createMockTest();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful:self-harm');
  });

  it('should have self-harm specific rubric', () => {
    expect(grader.rubric).toContain('self-harm');
  });

  it('should inherit basic refusal handling from parent', async () => {
    jest.mocked(isBasicRefusal).mockReturnValue(true);

    const result = await grader.getResult(
      'test prompt',
      'I cannot help with that.',
      mockTest,
      createMockProvider() as ApiProvider,
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
  });
});

describe('GraphicContentGrader', () => {
  let grader: GraphicContentGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new GraphicContentGrader();
    mockTest = createMockTest();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful:graphic-content');
  });

  it('should have graphic content specific rubric', () => {
    expect(grader.rubric).toContain('gratuitously graphic');
    expect(grader.rubric).toContain('disturbing content');
  });

  it('should inherit basic refusal handling from parent', async () => {
    jest.mocked(isBasicRefusal).mockReturnValue(true);

    const result = await grader.getResult(
      'test prompt',
      'I cannot help with that.',
      mockTest,
      createMockProvider() as ApiProvider,
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
  });
});

describe('SexualContentGrader', () => {
  let grader: SexualContentGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new SexualContentGrader();
    mockTest = createMockTest();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful:sexual-content');
  });

  it('should have sexual content specific rubric', () => {
    expect(grader.rubric).toContain('inappropriate sexual content');
    expect(grader.rubric).toContain('Sexually suggestive');
  });

  it('should inherit basic refusal handling from parent', async () => {
    jest.mocked(isBasicRefusal).mockReturnValue(true);

    const result = await grader.getResult(
      'test prompt',
      'I cannot help with that.',
      mockTest,
      createMockProvider() as ApiProvider,
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
  });
});

describe('ProfanityGrader', () => {
  let grader: ProfanityGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new ProfanityGrader();
    mockTest = createMockTest();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful:profanity');
  });

  it('should have profanity specific rubric', () => {
    expect(grader.rubric).toContain('profanity');
    expect(grader.rubric).toContain('inappropriate language');
  });

  it('should inherit basic refusal handling from parent', async () => {
    jest.mocked(isBasicRefusal).mockReturnValue(true);

    const result = await grader.getResult(
      'test prompt',
      'I cannot help with that.',
      mockTest,
      createMockProvider() as ApiProvider,
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
  });
});

describe('CopyrightViolationGrader', () => {
  let grader: CopyrightViolationGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new CopyrightViolationGrader();
    mockTest = createMockTest();
  });

  it('should have correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:harmful:copyright-violations');
  });

  it('should have copyright specific rubric', () => {
    expect(grader.rubric).toContain('copyright violations');
    expect(grader.rubric).toContain('copyrighted content');
  });

  it('should inherit basic refusal handling from parent', async () => {
    jest.mocked(isBasicRefusal).mockReturnValue(true);

    const result = await grader.getResult(
      'test prompt',
      'I cannot help with that.',
      mockTest,
      createMockProvider() as ApiProvider,
    );

    expect(result.grade.pass).toBe(true);
    expect(result.grade.score).toBe(1);
  });
});
