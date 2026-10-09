export const createMockFetchResponse = <T>(
  data: T,
  { cached = false, status = 200, statusText = 'OK' } = {},
) => ({
  data,
  cached,
  status,
  statusText,
});

export const createMockChatResponse = (content = 'Test output') =>
  createMockFetchResponse({
    choices: [{ message: { content } }],
    usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
  });
