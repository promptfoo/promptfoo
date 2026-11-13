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

export const createApiKeyOptions = (apiKey = 'test-key') => ({
  config: { apiKey },
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

export const createMcpServerOptions = (command = 'npm', args = 'start') => ({
  enabled: true,
  server: createMcpServerConfig(command, args),
});

export const createBasePathOptions = () => ({
  id: 'testId',
  config: { basePath: '/base' },
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

export const createAzureApiOptions = () => ({
  config: {
    apiHost: 'test.azure.com',
    apiKey: 'test-key',
  },
});

export const createHttpResponse = (data = 'response', status = 200, statusText = 'OK') => ({
  data,
  status,
  statusText,
  cached: false,
});

export const createOtlpOptions = () => ({
  host: '127.0.0.1',
  port: 4318,
  acceptFormats: ['json' as const],
});

export const createChatUsage = (prompt_tokens = 10, completion_tokens = 20, total_tokens = 30) => ({
  prompt_tokens,
  completion_tokens,
  total_tokens,
});

export const createGetOptions = () => ({
  config: {
    method: 'GET',
  },
});

export const createPassingGrade = (score = 0.8, reason = 'test reason') => ({
  pass: true,
  score,
  reason,
});

export const createStreamingOptions = () => ({
  config: { apiKey: 'test-key', stream: true },
});

export const createAnthropicEnvOptions = () => ({
  env: { ANTHROPIC_API_KEY: 'test-api-key' },
});

export const createTemperatureOptions = () => ({
  config: { temperature: 0.7 },
});

export const createLocationProperties = () => ({
  location: { type: 'string' },
});

export const createTestOutput = (output = 'Test output') => ({
  output,
});

export const createStringAssertion = <TType extends string>(type: TType, value: string) => ({
  type,
  value,
});

export const createThresholdAssertion = <TType extends string>(type: TType, threshold: number) => ({
  type,
  threshold,
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

export const createQueryContext = (query: string, context: string) => ({
  vars: {
    query,
    context,
  },
  options: {},
});

export const createCompletedResponse = (
  text: string,
  input_tokens: number,
  total_tokens: number,
) => ({
  id: 'resp_abc123',
  status: 'completed',
  model: 'gpt-4o',
  output: [createResponseMessage(text)],
  usage: { input_tokens, output_tokens: 10, total_tokens },
});

export const createSingleAssertionTest = <TType extends string>(type: TType, value: string) => ({
  assert: [createStringAssertion(type, value)],
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

export const createGeminiUsageCounts = (
  totalTokenCount: number,
  promptTokenCount: number,
  candidatesTokenCount: number,
) => ({
  totalTokenCount,
  promptTokenCount,
  candidatesTokenCount,
});

export const createTypeConfig = <TType extends string>(type: TType) => ({
  type,
});

export const createEmbeddingResult = (embedding: number, embedding2: number) => ({
  embedding: [embedding, embedding2, 0],
  tokenUsage: { total: 5, prompt: 2, completion: 3 },
});

export const createStatusResponse = (status = 500, statusText = 'Internal Server Error') => ({
  status,
  statusText,
});

export const createScriptAssertionParams = <TType extends string>(type: TType) => ({
  prompt: 'Test',
  assertion: { type, value: 'unused' },
  test: {},
  providerResponse: { output: 'Test output' },
});

export const createImageUsageCounts = (candidatesTokenCount: number, totalTokenCount: number) => ({
  promptTokenCount: 10,
  candidatesTokenCount,
  totalTokenCount,
});

export const createDebugContextFixture = (raw: string, label: string) => ({
  debug: true,
  prompt: { raw, label },
  vars: {},
});

export const createContentTypeResponse = (Content_Type = 'application/json') => ({
  status: 200,
  headers: { 'Content-Type': Content_Type },
});

export const createOAuthToken = (access_token: string) => ({
  access_token,
  expires_in: 3600,
});

export const createTextParts = (text: string, role: string) => ({
  parts: [{ text }],
  role,
});

export const createChatMessage = (role: string, content: string) => ({
  role,
  content,
});

export const createInputOutputUsage = (input_tokens: number, output_tokens: number) => ({
  input_tokens,
  output_tokens,
});

export const createMcpServerConfig = (command = 'npm', arg = 'start') => ({
  command,
  args: [arg],
});

export const createGoogleSearchTool = () => ({
  googleSearch: {},
});

export const createEnabledSetting = () => ({
  enabled: true,
});

export const createUnsetOpenAiGenerationEnv = () => ({
  OPENAI_MAX_TOKENS: undefined,
  OPENAI_MAX_COMPLETION_TOKENS: undefined,
  OPENAI_TEMPERATURE: undefined,
  OPENAI_TOP_P: undefined,
});
