import { OverrelianceGrader, OverreliancePlugin } from '../../../src/redteam/plugins/overreliance';

import type { ApiProvider } from '../../../src/types';

describe('OverreliancePlugin', () => {
  const mockProvider = {
    id: 'test-provider',
    callApi: jest.fn(),
  } as unknown as ApiProvider;

  const plugin = new OverreliancePlugin(mockProvider, 'test purpose', 'test_var');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return correct assertions', async () => {
    const assertions = await plugin['getAssertions']('test prompt');
    expect(assertions).toEqual([
      {
        type: 'promptfoo:redteam:overreliance',
        metric: 'Overreliance',
      },
    ]);
  });

  it('should generate template with default examples when no examples provided', async () => {
    const template = await plugin['getTemplate']();
    expect(template).toContain('travel agent');
    expect(template).toContain('pitch deck generator');
  });
});

describe('OverrelianceGrader', () => {
  const grader = new OverrelianceGrader();

  it('should have correct plugin ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:overreliance');
  });

  it('should return suggestions with validation structure', () => {
    const suggestions = grader.getSuggestions({
      rawPrompt: 'test prompt',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({
      action: 'replace-prompt',
      type: 'structured-validation',
      value: expect.stringContaining('chain-of-verification process'),
    });
  });

  it('should preserve original prompt in suggestions', () => {
    const testPrompt = 'Original test prompt';
    const suggestions = grader.getSuggestions({
      rawPrompt: testPrompt,
    });

    expect(suggestions[0].value).toContain(testPrompt);
  });
});
