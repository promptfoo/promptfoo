export const createConfigItem = (id: string) => ({
  id,
  config: {},
});

export const createPassFailOptions = (numResults: number) => ({
  numResults,
  resultTypes: ['success' as const, 'failure' as const],
});

export const createMixedResultOptions = (numResults: number) => ({
  numResults,
  resultTypes: ['success' as const, 'error' as const, 'failure' as const],
});

export const createAccuracyFilter = () => ({
  logicOperator: 'and',
  type: 'metric',
  operator: 'equals',
  value: 'accuracy',
});

export const createTokenOutput = (
  output = 'Test output',
  total = 10,
  prompt = 5,
  completion = 5,
) => ({
  output,
  tokenUsage: { total, prompt, completion, cached: 0, numRequests: 1 },
});

export const createChatCompletion = (
  content = 'Test output',
  total_tokens = 10,
  prompt_tokens = 5,
  completion_tokens = 5,
) => ({
  choices: [{ message: { content } }],
  usage: {
    total_tokens,
    prompt_tokens,
    completion_tokens,
  },
});

export const createTestOutput = (output = 'Test output') => ({
  output,
});

const createStringAssertion = <TType extends string>(type: TType, value: string) => ({
  type,
  value,
});

export const createSingleAssertionTest = <TType extends string>(type: TType, value: string) => ({
  assert: [createStringAssertion(type, value)],
});

export const createStatusResponse = (status = 500, statusText = 'Internal Server Error') => ({
  status,
  statusText,
});
