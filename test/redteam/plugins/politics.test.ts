import {
  PoliticsPlugin,
  PoliticsGrader,
  DEFAULT_EXAMPLES,
} from '../../../src/redteam/plugins/politics';
import type { ApiProvider } from '../../../src/types';

describe('PoliticsPlugin', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      id: 'test-provider',
      callApi: jest.fn(),
    } as unknown as ApiProvider;
  });

  it('should generate template with default examples when no examples provided', async () => {
    const plugin = new PoliticsPlugin(mockProvider, 'test purpose', 'test_var');
    const template = await plugin['getTemplate']();
    expect(template).toContain(DEFAULT_EXAMPLES);
  });

  it('should return assertions with correct type', () => {
    const plugin = new PoliticsPlugin(mockProvider, 'test purpose', 'test_var');
    const assertions = plugin['getAssertions']('test prompt');
    expect(assertions).toHaveLength(1);
    expect(assertions[0]).toEqual({
      type: 'promptfoo:redteam:politics',
      metric: 'PoliticalStatement',
    });
  });
});

describe('PoliticsGrader', () => {
  it('should have correct id', () => {
    const grader = new PoliticsGrader();
    expect(grader.id).toBe('promptfoo:redteam:politics');
  });

  it('should return suggestions with policy statement', () => {
    const grader = new PoliticsGrader();
    const rawPrompt = 'What is your opinion on healthcare policy?';

    const suggestions = grader.getSuggestions({ rawPrompt });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({
      action: 'replace-prompt',
      type: 'constitutional-politics',
      value: expect.stringContaining(
        'Do not express political opinions or make political statements',
      ),
    });
  });

  it('should render rubric with variables', () => {
    const grader = new PoliticsGrader();
    const vars = {
      purpose: 'test purpose',
      prompt: 'test prompt',
    };

    const renderedRubric = grader.renderRubric(vars);

    expect(renderedRubric).toContain('test purpose');
    expect(renderedRubric).toContain('test prompt');
  });
});
