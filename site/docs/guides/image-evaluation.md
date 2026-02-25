---
title: Evaluating Image Generation
description: How to evaluate and compare LLM-generated images using promptfoo with vision-capable graders
sidebar_label: Image Generation Evaluation
---

# Evaluating Image Generation

This guide shows how to evaluate generated images from providers like OpenAI and Google using a vision-capable LLM as a judge.

## How It Works

Promptfoo generates images via an image provider, then grades the output using `llm-rubric` with a vision-capable model. The key pieces:

1. **Image provider** generates images from prompts
2. **`PROMPTFOO_INLINE_MEDIA=true`** keeps images as inline data URIs instead of externalizing to disk
3. **Vision-capable grader** (e.g., `openai:chat:gpt-5`) evaluates the image using a multimodal rubric prompt

## Prerequisites

- Node.js 20+
- API key for your image provider (e.g., `OPENAI_API_KEY`)
- API key for a vision-capable grader model

## Complete Example

```yaml title="promptfooconfig.yaml"
description: Compare image generation models

prompts:
  - '{{prompt}}'

providers:
  - id: openai:image:gpt-image-1
    config:
      size: 1024x1024
      quality: low
  - id: openai:image:gpt-image-1-mini
    config:
      size: 1024x1024
      quality: low

defaultTest:
  options:
    provider: openai:chat:gpt-5
    rubricPrompt: |
      [
        {
          "role": "user",
          "content": [
            { "type": "image_url", "image_url": { "url": "{{output}}" } },
            { "type": "text", "text": "Evaluate this generated image.\n\nThe prompt was: '{{prompt}}'\n\nGrading criteria: {{rubric}}\n\nRespond with JSON: {reason: string, pass: boolean, score: number}" }
          ]
        }
      ]

tests:
  - vars:
      prompt: A photorealistic golden retriever puppy playing in autumn leaves
    assert:
      - type: llm-rubric
        value: The image is photorealistic (not cartoon), shows a golden retriever puppy, and includes autumn leaves
  - vars:
      prompt: A neon sign that reads "HELLO WORLD" on a dark brick wall
    assert:
      - type: llm-rubric
        value: The image shows a neon sign with legible text "HELLO WORLD" on a brick wall
```

Run with inline media enabled:

```sh
PROMPTFOO_INLINE_MEDIA=true promptfoo eval
```

## How the Rubric Prompt Works

The `rubricPrompt` must use [OpenAI chat format](/docs/configuration/chat) with `image_url` content blocks so the grader can see the generated image. The following variables are available:

- `{{output}}` - the provider's output (a data URI when `PROMPTFOO_INLINE_MEDIA=true`)
- `{{rubric}}` - the assertion's `value` text (your grading criteria)
- Any test `vars` (e.g., `{{prompt}}` from `vars.prompt`)

The rubric prompt is rendered with [Nunjucks](/docs/configuration/parameters), so all standard template features work.

## Non-OpenAI Providers

Image providers that return data URIs work out of the box. For example, [Google Imagen](/docs/providers/google#image-generation-models):

```yaml
providers:
  - id: google:imagen:imagen-3.0-generate-002
```

The grader provider must be vision-capable. Good options include `openai:chat:gpt-5`, `anthropic:messages:claude-sonnet-4-5-20250929`, or `google:gemini-2.0-flash`.

## Tips

- **Set `PROMPTFOO_INLINE_MEDIA=true`** in your `.env` file or as an environment variable. Without it, images are externalized to disk and the output will be a blob reference instead of a data URI.
- **Use `quality: low`** during development to reduce costs and speed up iteration.
- **Be specific in rubric criteria.** Instead of "good image," describe what you expect: subject, style, colors, text content, composition.
- **Use `--no-cache`** during development to ensure fresh image generation on each run.

## Further Reading

- [Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) for more on `llm-rubric`
- [OpenAI image provider](/docs/providers/openai#generating-images) for provider configuration
- [OpenAI images example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-images) for a working example with judge config
