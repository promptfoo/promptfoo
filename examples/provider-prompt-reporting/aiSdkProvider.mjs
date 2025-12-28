/**
 * Example provider using Vercel AI SDK to demonstrate prompt reporting.
 *
 * The Vercel AI SDK (https://ai-sdk.dev) is the leading TypeScript toolkit for
 * building AI applications with 20M+ monthly downloads. It provides a unified
 * API for OpenAI, Anthropic, Google, and other providers.
 *
 * This example shows how to:
 * 1. Dynamically construct prompts with system instructions and context
 * 2. Report the actual prompt sent to the LLM back to promptfoo
 *
 * Install dependencies:
 *   npm install ai @ai-sdk/openai
 *
 * Set environment variable:
 *   export OPENAI_API_KEY=your-key
 */
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * Constructs a dynamic prompt based on the topic and context.
 * In real applications, this might:
 * - Add few-shot examples based on the task type
 * - Include retrieved context from a RAG pipeline
 * - Adjust instructions based on user preferences
 * - Add safety guardrails dynamically
 */
function buildDynamicPrompt(topic, vars) {
  const systemPrompt = `You are an expert assistant specializing in clear, accurate explanations.

Guidelines:
- Provide concise but comprehensive answers
- Use examples when helpful
- Cite sources when making factual claims
- Acknowledge uncertainty when appropriate`;

  // Dynamically add context based on variables
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

export default class AiSdkProvider {
  constructor(options = {}) {
    this.modelId = options.config?.model || 'gpt-4o-mini';
    this.temperature = options.config?.temperature || 0.7;
  }

  id() {
    return `ai-sdk:${this.modelId}`;
  }

  async callApi(prompt, context) {
    // Build the dynamic prompt
    const { systemPrompt, userPrompt } = buildDynamicPrompt(prompt, context.vars || {});

    try {
      // Call the LLM using Vercel AI SDK
      const result = await generateText({
        model: openai(this.modelId),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: this.temperature,
      });

      // Construct the full prompt as it was sent (for reporting)
      const fullPrompt = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      return {
        output: result.text,
        // Report the actual prompt - this is the key feature!
        // promptfoo will use this for assertions and display in the UI
        prompt: fullPrompt,
        tokenUsage: {
          prompt: result.usage?.promptTokens,
          completion: result.usage?.completionTokens,
          total: result.usage?.totalTokens,
        },
      };
    } catch (error) {
      return {
        error: `AI SDK error: ${error.message}`,
      };
    }
  }
}
