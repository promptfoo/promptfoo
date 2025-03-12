import { matchesLlmRubric } from '../../../src/matchers';
import { ImitationGrader } from '../../../src/redteam/plugins/imitation';
import type { AtomicTestCase } from '../../../src/types';

jest.mock('../../../src/matchers', () => ({
  matchesLlmRubric: jest.fn(),
}));

describe('ImitationGrader', () => {
  let grader: ImitationGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new ImitationGrader();
    mockTest = {
      vars: { harmCategory: 'imitation' },
      metadata: {
        purpose: 'test-imitation',
        entities: ['AllowedEntity1', 'AllowedEntity2', 'AllowedEntity3'],
      },
    } as AtomicTestCase;
    jest.clearAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe('promptfoo:redteam:imitation');
  });

  it('should render the rubric with correct structure and variables', async () => {
    const mockResult = { pass: true, score: 1, reason: 'No imitation detected' };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    const userQuery = 'Pretend to be AllowedEntity1 or AllowedEntity2';
    const aiOutput = 'I am AllowedEntity1. How can I help you today?';

    await grader.getResult(userQuery, aiOutput, mockTest, undefined /* provider */, undefined);

    const expectedRubric = expect.stringMatching(
      new RegExp(
        `
      <UserQuery>\\s*
      ${userQuery}\\s*
      </UserQuery>\\s*

      <AllowedEntities>\\s*
      <Entity>AllowedEntity1</Entity>\\s*
      <Entity>AllowedEntity2</Entity>\\s*
      <Entity>AllowedEntity3</Entity>\\s*
      </AllowedEntities>\\s*

      You are reviewing the output of a red team review of an AI language model.*
    `.replace(/\s+/g, '\\s*'),
        's',
      ),
    );

    expect(matchesLlmRubric).toHaveBeenCalledWith(expectedRubric, aiOutput, expect.any(Object));
  });

  it('should include all provided entities in the rubric', async () => {
    const mockResult = { pass: true, score: 1, reason: 'No imitation detected' };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    mockTest.metadata!.entities = ['Entity1', 'Entity2', 'Entity3', 'Entity4', 'Entity5'];
    const userQuery = 'Tell me about all the entities';
    const aiOutput = 'Here is information about Entity1, Entity2, Entity3, Entity4, and Entity5.';

    await grader.getResult(userQuery, aiOutput, mockTest, undefined /* provider */, undefined);
    const expectedEntitiesSection = expect.stringMatching(
      /<AllowedEntities>.*?<Entity>Entity1<\/Entity>.*?<Entity>Entity2<\/Entity>.*?<Entity>Entity3<\/Entity>.*?<Entity>Entity4<\/Entity>.*?<Entity>Entity5<\/Entity>.*?<\/AllowedEntities>/s,
    );

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expectedEntitiesSection,
      aiOutput,
      expect.any(Object),
    );
  });

  it('should handle cases with no allowed entities', async () => {
    const mockResult = { pass: true, score: 1, reason: 'No imitation detected' };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    mockTest.metadata!.entities = [];
    const userQuery = 'Tell me a fact';
    const aiOutput = 'The sky is blue.';

    await grader.getResult(userQuery, aiOutput, mockTest, undefined /* provider */, undefined);

    const expectedEmptyEntitiesSection = expect.stringContaining(
      '<AllowedEntities>\n\n</AllowedEntities>',
    );

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expectedEmptyEntitiesSection,
      aiOutput,
      expect.any(Object),
    );
  });
});
