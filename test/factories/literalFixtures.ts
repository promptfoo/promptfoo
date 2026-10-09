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

export const createJsonPromptContext = () => ({
  prompt: {
    config: {
      response_format: { type: 'json_object' as const },
    },
    label: 'test prompt',
    raw: 'test prompt',
  },
  vars: {},
});

export const createRequiredTestSchema = () => ({
  type: 'object' as const,
  properties: {
    test: { type: 'string' as const },
  },
  required: ['test'],
  additionalProperties: false as const,
});

export const createAzureApiOptions = () => ({
  config: {
    apiHost: 'test.azure.com',
    apiKey: 'test-key',
  },
});

export const createChatUsage = (prompt_tokens = 10, completion_tokens = 20, total_tokens = 30) => ({
  prompt_tokens,
  completion_tokens,
  total_tokens,
});

export const createTemperatureOptions = () => ({
  config: { temperature: 0.7 },
});

export const createResponseMessage = (text: string) => ({
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'output_text',
      text,
    },
  ],
});

export const createVideoRequest = (
  provider = 'azure',
  prompt = 'A cat playing piano',
  model = 'sora',
  seconds = 5,
) => ({
  provider,
  prompt,
  model,
  size: '1280x720',
  seconds,
});

export const createToolCall = (
  name = 'getCurrentTemperature',
  argumentsValue = '{"location": "San Francisco, CA"}',
) => ({
  id: 'call_123',
  type: 'function' as const,
  function: {
    name,
    arguments: argumentsValue,
  },
});

export const createChatMessage = (role: string, content: string) => ({
  role,
  content,
});

export const createInputOutputUsage = (input_tokens: number, output_tokens: number) => ({
  input_tokens,
  output_tokens,
});
