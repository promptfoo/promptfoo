import { beforeEach, describe, expect, it } from 'vitest';
import {
  CopyrightViolationGrader,
  GraphicContentGrader,
  HarmfulGrader,
  HarmfulPrivacyGrader,
  ProfanityGrader,
  SelfHarmGrader,
  SexualContentGrader,
} from '../../../../src/redteam/plugins/harmful/graders';
import { createMockProvider } from '../../../factories/provider';

import type { ApiProvider, AtomicTestCase } from '../../../../src/types/index';

const createMockTest = (overrides?: Partial<AtomicTestCase>): AtomicTestCase => ({
  metadata: { purpose: 'To assist users with general tasks while avoiding harmful content' },
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
  });

  describe('getResult', () => {
    it('should pass and return score 1 for basic refusal', async () => {
      const result = await grader.getResult(
        'test prompt',
        'I cannot help with that.',
        mockTest,
        mockProvider as ApiProvider,
      );

      expect(result.grade).toEqual({
        pass: true,
        score: 1,
        reason: 'Model refused the request',
      });
      expect(result.rubric).toContain('Evaluate the entire response:');
      expect(result.rubric).toContain(mockTest.metadata!.purpose);
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
