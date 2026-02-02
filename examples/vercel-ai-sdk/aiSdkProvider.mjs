/**
 * Vercel AI SDK Provider with Dynamic Prompt Reporting
 *
 * This provider demonstrates a real-world pattern: dynamically constructing
 * prompts based on context, then reporting the actual prompt back to promptfoo.
 *
 * Why this matters:
 * - Without prompt reporting, promptfoo shows "{{topic}}" as the prompt
 * - With prompt reporting, you see the full system instructions and context
 * - This enables prompt-based assertions and debugging
 *
 * The Vercel AI SDK (https://ai-sdk.dev) is the TypeScript toolkit for AI apps
 * with 20M+ monthly downloads, supporting OpenAI, Anthropic, Google, and more.
 *
 * Usage:
 *   npm install ai @ai-sdk/openai
 *   OPENAI_API_KEY=sk-... npx promptfoo@latest eval
 */
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

// =============================================================================
// PROMPT TEMPLATES - These simulate what frameworks like LangChain do
// =============================================================================

const SYSTEM_TEMPLATES = {
  expert: `You are a world-class expert in {{domain}}.

Your communication style:
- Clear and precise explanations
- Use analogies for complex concepts
- Include concrete examples
- Acknowledge limitations honestly

Your audience: {{audience}}`,

  coder: `You are an expert software engineer specializing in {{domain}}.

Guidelines:
- Write clean, idiomatic code
- Explain your reasoning
- Consider edge cases
- Suggest best practices

Target experience level: {{audience}}`,

  analyst: `You are a data analyst specializing in {{domain}}.

Your approach:
- Ground claims in evidence
- Quantify when possible
- Consider multiple perspectives
- Identify key insights

Report format: {{format}}`,
};

const USER_TEMPLATES = {
  explain: `Explain {{topic}} in a way that's accessible and engaging.

Focus on:
1. Core concepts and why they matter
2. Real-world applications
3. Common misconceptions to avoid`,

  compare: `Compare and contrast: {{topic}}

Structure your response as:
1. Key similarities
2. Key differences
3. When to use each
4. Recommendations`,

  troubleshoot: `Help troubleshoot: {{topic}}

Provide:
1. Common causes
2. Diagnostic steps
3. Solutions ranked by likelihood
4. Prevention strategies`,
};

// =============================================================================
// DYNAMIC PROMPT BUILDER - The core of this example
// =============================================================================

function buildPrompt(rawPrompt, vars) {
  // Determine the best template based on the task
  const taskType = vars.task_type || 'explain';
  const persona = vars.persona || 'expert';

  // Get templates
  const systemTemplate = SYSTEM_TEMPLATES[persona] || SYSTEM_TEMPLATES.expert;
  const userTemplate = USER_TEMPLATES[taskType] || USER_TEMPLATES.explain;

  // Fill in template variables
  const fillTemplate = (template, variables) => {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });
  };

  const templateVars = {
    topic: rawPrompt,
    domain: vars.domain || 'the requested topic',
    audience: vars.audience || 'general audience',
    format: vars.format || 'clear prose',
    ...vars,
  };

  const systemPrompt = fillTemplate(systemTemplate, templateVars);
  const userPrompt = fillTemplate(userTemplate, templateVars);

  // Add any retrieved context (simulating RAG)
  let contextAddition = '';
  if (vars.context) {
    contextAddition = `\n\nRelevant context:\n${vars.context}`;
  }

  // Add few-shot examples if provided
  let examplesAddition = '';
  if (vars.examples) {
    examplesAddition = `\n\nExamples for reference:\n${vars.examples}`;
  }

  return {
    system: systemPrompt,
    user: userPrompt + contextAddition + examplesAddition,
  };
}

// =============================================================================
// PROVIDER CLASS
// =============================================================================

export default class AiSdkProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.modelId = this.config.model || 'gpt-4o-mini';
    this.temperature = this.config.temperature ?? 0.7;
  }

  id() {
    return `ai-sdk:${this.modelId}`;
  }

  async callApi(prompt, context) {
    const vars = context.vars || {};

    // Build the dynamic prompt
    const { system, user } = buildPrompt(prompt, vars);

    // Construct the messages array (what we'll actually send)
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    try {
      // Call the LLM using Vercel AI SDK
      const result = await generateText({
        model: openai(this.modelId),
        messages,
        temperature: this.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
      });

      return {
        output: result.text,

        // THE KEY FEATURE: Report what prompt was actually sent
        // This enables:
        // 1. UI shows "Actual Prompt Sent" instead of the template
        // 2. Assertions can check the real prompt content
        // 3. Moderation runs on the actual prompt
        prompt: messages,

        tokenUsage: {
          prompt: result.usage?.inputTokens,
          completion: result.usage?.outputTokens,
          total: result.usage?.totalTokens,
        },
      };
    } catch (error) {
      return {
        error: `AI SDK error: ${error.message}`,
        // Still report the prompt even on error - useful for debugging
        prompt: messages,
      };
    }
  }
}
