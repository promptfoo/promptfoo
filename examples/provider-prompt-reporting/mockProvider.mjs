/**
 * Mock provider for testing prompt reporting without API keys.
 *
 * This provider simulates the behavior of the AI SDK provider,
 * dynamically constructing prompts and reporting them back to promptfoo.
 *
 * Use this for:
 * - Testing without API keys
 * - CI/CD pipelines
 * - Understanding how prompt reporting works
 */

function buildDynamicPrompt(topic, vars) {
  const systemPrompt = `You are an expert assistant specializing in clear, accurate explanations.

Guidelines:
- Provide concise but comprehensive answers
- Use examples when helpful
- Cite sources when making factual claims
- Acknowledge uncertainty when appropriate`;

  let contextSection = '';
  if (vars.audience) {
    contextSection += `\nTarget audience: ${vars.audience}`;
  }
  if (vars.format) {
    contextSection += `\nResponse format: ${vars.format}`;
  }

  const userPrompt = `Please explain the following topic:

Topic: ${topic}
${contextSection}

Provide a helpful, well-structured response.`;

  return { systemPrompt, userPrompt };
}

export default class MockProvider {
  id() {
    return 'mock-ai-sdk-provider';
  }

  async callApi(prompt, context) {
    const { systemPrompt, userPrompt } = buildDynamicPrompt(prompt, context.vars || {});

    // Generate a mock response based on the topic
    const topic = context.vars?.topic || prompt;
    const mockResponse = `Here's an explanation of ${topic}:

This is a mock response demonstrating prompt reporting. In production, this would be
a real LLM response generated from the dynamically constructed prompt shown below.

Key points about ${topic}:
- Point 1: Important concept related to ${topic}
- Point 2: Another relevant aspect
- Point 3: Practical applications

The actual prompt sent to the LLM includes system instructions and contextual
information that was dynamically added based on the variables provided.`;

    // Report the full prompt as it would be sent
    const fullPrompt = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    return {
      output: mockResponse,
      // The key feature: report what prompt was actually constructed
      prompt: fullPrompt,
      tokenUsage: {
        prompt: systemPrompt.length + userPrompt.length,
        completion: mockResponse.length,
        total: systemPrompt.length + userPrompt.length + mockResponse.length,
      },
    };
  }
}
