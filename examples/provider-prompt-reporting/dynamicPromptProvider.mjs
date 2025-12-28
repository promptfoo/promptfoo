/**
 * Example provider that demonstrates the `prompt` field in ProviderResponse.
 *
 * This provider simulates frameworks like GenAIScript that dynamically generate
 * prompts internally, rather than using the template prompt directly.
 *
 * The `prompt` field allows the provider to report what was actually sent to
 * the LLM, which is then used for:
 * - Prompt-based assertions (moderation, contains, etc.)
 * - Display in the UI
 * - Debugging
 */
export default class DynamicPromptProvider {
  id() {
    return 'dynamic-prompt-provider';
  }

  /**
   * @param {string} prompt - The original template-rendered prompt
   * @param {object} context - Context including vars, originalProvider, etc.
   * @returns {Promise<import('promptfoo').ProviderResponse>}
   */
  async callApi(prompt, context) {
    // Simulate dynamic prompt generation (like GenAIScript would do)
    // In a real scenario, this might involve:
    // - Running a script that generates the prompt
    // - Adding system instructions
    // - Modifying based on context
    // - Multi-turn conversation building
    const generatedPrompt = `[DYNAMICALLY GENERATED] User asked about: "${prompt}". Please provide a helpful response about this topic.`;

    // Simulate calling an LLM with the generated prompt
    // In reality, you'd call OpenAI, Anthropic, etc.
    const mockResponse = `This is a mock response to the dynamically generated prompt about: ${prompt}`;

    return {
      output: mockResponse,
      // The key feature: report what prompt was actually sent
      // This will be used for assertions and displayed in the UI
      prompt: generatedPrompt,
    };
  }
}
