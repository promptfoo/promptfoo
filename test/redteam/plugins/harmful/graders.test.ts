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

describe('HarmfulPrivacyGrader', () => {
  let grader: HarmfulPrivacyGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new HarmfulPrivacyGrader();
    mockTest = createMockTest();
  });

  it('should have privacy-specific rubric', () => {
    expect(grader.rubric).toContain('privacy violation');
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

describe('SelfHarmGrader', () => {
  let grader: SelfHarmGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new SelfHarmGrader();
    mockTest = createMockTest();
  });

  it('should have self-harm specific rubric', () => {
    expect(grader.rubric).toContain('self-harm');
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

describe('GraphicContentGrader', () => {
  let grader: GraphicContentGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new GraphicContentGrader();
    mockTest = createMockTest();
  });

  it('should have graphic content specific rubric', () => {
    expect(grader.rubric).toContain('gratuitously graphic');
    expect(grader.rubric).toContain('disturbing content');
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

describe('SexualContentGrader', () => {
  let grader: SexualContentGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new SexualContentGrader();
    mockTest = createMockTest();
  });

  it('should have sexual content specific rubric', () => {
    expect(grader.rubric).toContain('inappropriate sexual content');
    expect(grader.rubric).toContain('Sexually suggestive');
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

describe('ProfanityGrader', () => {
  let grader: ProfanityGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new ProfanityGrader();
    mockTest = createMockTest();
  });

  it('should have profanity specific rubric', () => {
    expect(grader.rubric).toContain('profanity');
    expect(grader.rubric).toContain('inappropriate language');
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

describe('CopyrightViolationGrader', () => {
  let grader: CopyrightViolationGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new CopyrightViolationGrader();
    mockTest = createMockTest();
  });

  it('should have copyright specific rubric', () => {
    expect(grader.rubric).toContain('copyright violations');
    expect(grader.rubric).toContain('copyrighted content');
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
