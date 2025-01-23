const PRIORITY_STRATEGIES = ['jailbreak:composite', 'pliny', 'prompt-injections'];

const sortByPriorityStrategies = (
  a: { gradingResult?: any },
  b: { gradingResult?: any },
): number => {
  const strategyA = a.gradingResult ? a.gradingResult.id : '';
  const strategyB = b.gradingResult ? b.gradingResult.id : '';

  const priorityA = PRIORITY_STRATEGIES.indexOf(strategyA || '');
  const priorityB = PRIORITY_STRATEGIES.indexOf(strategyB || '');

  if (priorityA !== -1 && priorityB !== -1) {
    return priorityA - priorityB;
  }
  if (priorityA !== -1) {
    return -1;
  }
  if (priorityB !== -1) {
    return 1;
  }
  return 0;
};

const getPromptDisplayString = (prompt: string): string => {
  try {
    const parsedPrompt = JSON.parse(prompt);
    if (Array.isArray(parsedPrompt)) {
      const lastPrompt = parsedPrompt[parsedPrompt.length - 1];
      if (lastPrompt.content) {
        return lastPrompt.content || '-';
      }
    }
  } catch {
    // Ignore error
  }
  return prompt;
};

const getOutputDisplay = (output: any) => {
  if (typeof output === 'string') {
    return output;
  }
  if (Array.isArray(output)) {
    const items = output.filter((item) => item.type === 'function');
    if (items.length > 0) {
      return items.map((item) => ({
        id: item.id,
        function: item.function,
      }));
    }
  }
  return JSON.stringify(output);
};

describe('sortByPriorityStrategies', () => {
  it('should prioritize specific strategies', () => {
    const items = [
      { gradingResult: { id: 'other' } },
      { gradingResult: { id: 'jailbreak:composite' } },
      { gradingResult: { id: 'pliny' } },
    ];

    const sorted = [...items].sort(sortByPriorityStrategies);

    expect(sorted[0].gradingResult?.id).toBe('jailbreak:composite');
    expect(sorted[1].gradingResult?.id).toBe('pliny');
    expect(sorted[2].gradingResult?.id).toBe('other');
  });

  it('should handle items without grading results', () => {
    const items = [{ gradingResult: undefined }, { gradingResult: { id: 'pliny' } }];

    const sorted = [...items].sort(sortByPriorityStrategies);
    expect(sorted[0].gradingResult?.id).toBe('pliny');
  });
});

describe('getPromptDisplayString', () => {
  it('should extract content from JSON array prompt', () => {
    const prompt = JSON.stringify([{ content: 'first' }, { content: 'last message' }]);

    expect(getPromptDisplayString(prompt)).toBe('last message');
  });

  it('should return original string for non-JSON prompt', () => {
    const prompt = 'simple prompt';
    expect(getPromptDisplayString(prompt)).toBe('simple prompt');
  });

  it('should handle malformed JSON', () => {
    const prompt = '{invalid json';
    expect(getPromptDisplayString(prompt)).toBe('{invalid json');
  });
});

describe('getOutputDisplay', () => {
  it('should handle string output', () => {
    expect(getOutputDisplay('test output')).toBe('test output');
  });

  it('should handle function array output', () => {
    const output = [
      {
        type: 'function',
        id: '1',
        function: {
          name: 'testFunc',
          arguments: 'arg1, arg2',
        },
      },
    ];

    const result = getOutputDisplay(output) as any[];
    expect(result[0].id).toBe('1');
    expect(result[0].function.name).toBe('testFunc');
  });

  it('should stringify object output', () => {
    const output = { key: 'value' };
    expect(getOutputDisplay(output)).toBe(JSON.stringify(output));
  });
});
