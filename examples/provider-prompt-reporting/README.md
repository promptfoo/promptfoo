# provider-prompt-reporting (Dynamic Prompt Reporting)

Demonstrates how providers can report the **actual prompt** they sent to the LLM, enabling proper assertions and debugging when prompts are constructed dynamically.

## The Problem

Modern LLM applications don't use simple templates—they dynamically construct prompts with:

- **System instructions** tailored to the task
- **Few-shot examples** selected at runtime
- **Retrieved context** from RAG pipelines
- **User preferences** and safety guardrails

Without prompt reporting, promptfoo shows `{{topic}}` as the prompt, making it impossible to:

- Debug what was actually sent to the model
- Run assertions on the real prompt content
- Perform moderation checks on dynamic content

## The Solution

This example uses the [Vercel AI SDK](https://ai-sdk.dev) (20M+ monthly downloads) to demonstrate how providers report the actual prompt:

```javascript
return {
  output: result.text,
  // Report what was actually sent to the LLM
  prompt: [
    { role: 'system', content: dynamicSystemPrompt },
    { role: 'user', content: dynamicUserPrompt },
  ],
};
```

## Features Demonstrated

| Feature               | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| **Multiple personas** | `expert`, `coder`, `analyst` with different system prompts     |
| **Task types**        | `explain`, `compare`, `troubleshoot` with different structures |
| **Context injection** | RAG-style context added to prompts                             |
| **Template filling**  | Variables like `{{domain}}`, `{{audience}}` filled dynamically |

## Running the Example

```bash
# Initialize
npx promptfoo@latest init --example provider-prompt-reporting
cd provider-prompt-reporting

# Install dependencies
npm install

# Set your API key
export OPENAI_API_KEY=sk-...

# Run the evaluation
npx promptfoo@latest eval

# View results in browser
npx promptfoo@latest view
```

## What You'll See

In the promptfoo UI, click on any result to see **"Actual Prompt Sent"** showing the full dynamically-constructed prompt instead of just `{{topic}}`.

Example transformation:

**Input (what you write):**

```yaml
vars:
  topic: quantum entanglement
  persona: expert
  domain: quantum physics
  audience: college students
```

**Actual Prompt Sent (what the LLM receives):**

```
System: You are a world-class expert in quantum physics.

Your communication style:
- Clear and precise explanations
- Use analogies for complex concepts
- Include concrete examples
- Acknowledge limitations honestly

Your audience: college students

User: Explain quantum entanglement in a way that's accessible and engaging.

Focus on:
1. Core concepts and why they matter
2. Real-world applications
3. Common misconceptions to avoid
```

## Files

| File                   | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `aiSdkProvider.mjs`    | Provider using Vercel AI SDK with dynamic prompt construction |
| `promptfooconfig.yaml` | Test cases showcasing different personas and task types       |
| `package.json`         | Dependencies (`ai`, `@ai-sdk/openai`)                         |

## Adapting for Your Use Case

The pattern works with any framework:

```javascript
// LangChain
const chain = prompt.pipe(model);
const result = await chain.invoke(input);
return {
  output: result,
  prompt: prompt.format(input), // Report the formatted prompt
};

// Custom RAG
const context = await retrieveContext(query);
const fullPrompt = `Context: ${context}\n\nQuestion: ${query}`;
const result = await llm.generate(fullPrompt);
return {
  output: result,
  prompt: fullPrompt, // Report prompt with retrieved context
};
```

## Learn More

- [Vercel AI SDK Documentation](https://ai-sdk.dev)
- [promptfoo Custom Providers](https://promptfoo.dev/docs/providers/custom-api)
