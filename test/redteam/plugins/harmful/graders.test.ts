import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CopyrightViolationGrader,
  GraphicContentGrader,
  HarmfulGrader,
  HarmfulPrivacyGrader,
  ProfanityGrader,
  SelfHarmGrader,
  SexualContentGrader,
} from '../../../../src/redteam/plugins/harmful/graders';
import { isBasicRefusal } from '../../../../src/redteam/util';
import { createMockProvider } from '../../../factories/provider';

import type { ApiProvider, AtomicTestCase } from '../../../../src/types/index';

vi.mock('../../../../src/redteam/util');

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
    vi.mocked(isBasicRefusal).mockReset();
  });

  describe('getResult', () => {
    it('should pass and return score 1 for basic refusal', async () => {
      vi.mocked(isBasicRefusal).mockReturnValue(true);

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
        assertion: undefined,
      });
      expect(result.rubric).toBe(grader.rubric);
    });

    it('should fallback to superclass getResult for non-refusal', async () => {
      vi.mocked(isBasicRefusal).mockReturnValue(false);

      const superGetResult = vi.spyOn(Object.getPrototypeOf(HarmfulGrader.prototype), 'getResult');
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
        undefined, // additionalRubric
        undefined, // skipRefusalCheck
        undefined, // gradingContext
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

describe.each([
  {
    name: 'HarmfulPrivacyGrader',
    Grader: HarmfulPrivacyGrader,
    rubricTest: 'should have privacy-specific rubric',
    terms: ['privacy violation'],
  },
  {
    name: 'SelfHarmGrader',
    Grader: SelfHarmGrader,
    rubricTest: 'should have self-harm specific rubric',
    terms: ['self-harm'],
  },
  {
    name: 'GraphicContentGrader',
    Grader: GraphicContentGrader,
    rubricTest: 'should have graphic content specific rubric',
    terms: ['gratuitously graphic', 'disturbing content'],
  },
  {
    name: 'SexualContentGrader',
    Grader: SexualContentGrader,
    rubricTest: 'should have sexual content specific rubric',
    terms: ['inappropriate sexual content', 'Sexually suggestive'],
  },
  {
    name: 'ProfanityGrader',
    Grader: ProfanityGrader,
    rubricTest: 'should have profanity specific rubric',
    terms: ['profanity', 'inappropriate language'],
  },
  {
    name: 'CopyrightViolationGrader',
    Grader: CopyrightViolationGrader,
    rubricTest: 'should have copyright specific rubric',
    terms: ['copyright violations', 'copyrighted content'],
  },
])('$name', ({ Grader, rubricTest, terms }) => {
  let grader: HarmfulGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new Grader();
    mockTest = createMockTest();
  });

  it(rubricTest, () => {
    for (const term of terms) {
      expect(grader.rubric).toContain(term);
    }
  });

  it('should inherit basic refusal handling from parent', async () => {
    vi.mocked(isBasicRefusal).mockReturnValue(true);

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
