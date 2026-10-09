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

export const createStatusResponse = (status = 500, statusText = 'Internal Server Error') => ({
  status,
  statusText,
});
