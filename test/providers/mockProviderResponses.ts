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

export const createInvalidRequestResponse = () => {
  const errorResponse = {
    error: {
      message: 'API Error',
      type: 'invalid_request_error',
    },
  };
  return new Response(JSON.stringify(errorResponse), {
    status: 400,
    statusText: 'Bad Request',
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });
};
