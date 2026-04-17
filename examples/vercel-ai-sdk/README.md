# vercel-ai-sdk (Vercel AI SDK Provider)

Demonstrates dynamic prompt construction using the [Vercel AI SDK](https://ai-sdk.dev) with promptfoo's provider prompt reporting feature.

## Why This Matters

Modern LLM applications dynamically construct prompts with:

- **System instructions** tailored to the task
- **Few-shot examples** selected at runtime
- **Retrieved context** from RAG pipelines
- **User preferences** and safety guardrails

Without prompt reporting, promptfoo shows `{{topic}}` as the prompt, making it impossible to debug what was actually sent or run assertions on the real prompt content.

## How It Works

The provider reports the actual prompt it sent using the `prompt` field:

```javascript
return {
  output: result.text,
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
npx promptfoo@latest init --example vercel-ai-sdk
cd vercel-ai-sdk
npm install
export OPENAI_API_KEY=sk-...
npx promptfoo@latest eval
npx promptfoo@latest view
```

## What You'll See

In the promptfoo UI, click any result to see **"Actual Prompt Sent"** showing the full dynamically-constructed prompt instead of just `{{topic}}`.

**Input:**

```yaml
vars:
  topic: quantum entanglement
  persona: expert
  domain: quantum physics
  audience: college students
```

**Actual Prompt Sent:**

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
  prompt: prompt.format(input),
};

// Custom RAG
const context = await retrieveContext(query);
const fullPrompt = `Context: ${context}\n\nQuestion: ${query}`;
const result = await llm.generate(fullPrompt);
return {
  output: result,
  prompt: fullPrompt,
};
```

## Learn More

- [Vercel AI SDK Documentation](https://ai-sdk.dev)
- [promptfoo Custom Providers](https://promptfoo.dev/docs/providers/custom-api)
