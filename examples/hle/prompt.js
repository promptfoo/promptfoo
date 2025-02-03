const SYSTEM_EXACT_ANSWER = `Your response should be in the following format:
Explanation: {your explanation for your final answer}
Exact Answer: {your succinct, final answer}
Confidence: {your confidence score between 0% and 100% for your answer}`;

const SYSTEM_MC = `Your response should be in the following format:
Explanation: {your explanation for your answer choice}
Answer: {your chosen answer}
Confidence: {your confidence score between 0% and 100% for your answer}`;

/**
 * Format an HLE question into OpenAI chat messages
 * @param {object} param0.vars - The variables from the test case
 * @param {object} param0.provider - The provider information
 * @returns {array} Array of chat messages
 */
module.exports = function ({ vars, provider }) {
  const systemPrompt = vars.answer_type === 'exact_match' ? SYSTEM_EXACT_ANSWER : SYSTEM_MC;

  // Build question text
  let questionText = vars.question;

  // Add multiple choice options if present
  if (vars.choices && vars.choices.length) {
    questionText +=
      '\n\nOptions:\n' +
      vars.choices.map((choice, i) => `${String.fromCharCode(65 + i)}) ${choice}`).join('\n');
  }

  // openai reasoning models (o1, o3) don't use system prompts
  const systemRole =
    provider.id?.includes('o1') || provider.id?.includes('o3') ? 'developer' : 'system';

  const messages = [
    { role: systemRole, content: systemPrompt },
    { role: 'user', content: questionText },
  ];

  // Add image as separate message if present
  if (vars.image && vars.image !== '') {
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: vars.image },
        },
      ],
    });
  }

  return JSON.stringify(messages);
};
