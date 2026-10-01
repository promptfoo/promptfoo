---
title: Evaluating Image Generation
description: Compare generated images with Promptfoo using a vision-capable grader, automatic image attachments, and concrete rubric criteria for subjects, style, and text.
sidebar_label: Image Generation Evaluation
sidebar_position: 7
---

# Evaluating Image Generation

Use `llm-rubric` with a vision-capable grader to compare generated images against written criteria. Promptfoo automatically attaches structured images whose `data` contains a data URI or raw base64 bytes.

## How It Works

Each test sends a prompt to the image provider. The grader receives the generated images and the assertion's criteria, then returns a pass/fail result, score, and reason. Set `PROMPTFOO_INLINE_MEDIA=true` to keep image bytes available to the grader. Remote image URLs and stored blob references are not supported by this grading path.

The GPT Image and Gemini image routes shown below return image bytes. For other `openai:image` compatibility routes, set `config.response_format: b64_json` and use an endpoint that supports that format. Inline media preserves bytes already in the response; it does not download image URLs.

## Prerequisites

- Node.js 22.22 or later
- API access to the image and vision-capable grader models in your configuration
- The relevant provider API key, such as `OPENAI_API_KEY`

## Complete Example

```yaml title="promptfooconfig.yaml"
description: Compare image generation models

prompts:
  - '{{prompt}}'

providers:
  - id: openai:image:gpt-image-2.5-flare
    config:
      size: 1024x1024
      quality: low
  - id: openai:image:gpt-image-2.5-sunburst
    config:
      size: 1024x1024
      quality: low

defaultTest:
  options:
    provider: openai:gpt-6-sol

tests:
  - vars:
      prompt: A photorealistic golden retriever puppy playing in autumn leaves
    assert:
      - type: llm-rubric
        value: The image is photorealistic, shows a golden retriever puppy, and includes autumn leaves
  - vars:
      prompt: A neon sign that reads "HELLO WORLD" on a dark brick wall
    assert:
      - type: llm-rubric
        value: The image shows a neon sign with legible text "HELLO WORLD" on a brick wall
```

Run the eval and export its results:

```sh
PROMPTFOO_INLINE_MEDIA=true promptfoo eval -c promptfooconfig.yaml --no-cache -o results.json
```

Inspect each result's `success`, `score`, and `gradingResult.reason`. A model grader's score reflects its judgment against your criteria; review the images as well when assessing model quality.

## How the Rubric Prompt Works

The default rubric prompt handles image attachments. If you need custom instructions, keep them text-only and let Promptfoo attach the images:

```yaml
defaultTest:
  options:
    provider: openai:gpt-6-sol
    rubricPrompt: |
      Evaluate the attached image against this prompt: {{prompt}}
      Criteria: {{rubric}}
      Respond with JSON containing reason (string), pass (boolean), and score (number from 0 to 1).
```

`{{rubric}}` contains the assertion's `value`; test variables such as `{{prompt}}` are also available. For structured image outputs, `{{output}}` may contain an attachment placeholder. Do not use it as an `image_url`: the actual images are already attached.

:::note

`llm-rubric` limits responses to four images by default. Set `PROMPTFOO_GRADING_MAX_IMAGES` to change the limit; responses above it fail grading before the judge is called. OpenAI image providers support `n: 1` to request one image. Gemini image providers do not use `n`.

:::

## Non-OpenAI Providers

Select a provider that returns structured images, such as a [Gemini image model](/docs/providers/google#gemini-native-image-generation-models):

```yaml
providers:
  - id: google:gemini-3.1-flash-image
```

A custom provider should return images through [`ProviderResponse.images`](/docs/configuration/reference/#providerresponse). Set each image's `data` to a data URI or raw base64 bytes, with the corresponding `mimeType`. A raw JSON string containing `b64_json` is not a structured image response and is not covered by this workflow. The grader must support image inputs.

## Tips

- Write criteria for observable details: subject, style, colors, text, or composition.
- Use a lower supported quality setting while developing the rubric.
- Use `--no-cache` when you need fresh image generation; omit it when reusing cached responses is useful.
- Keep `PROMPTFOO_INLINE_MEDIA=true` enabled for image grading; exported media also remains self-contained.

## Further Reading

- [Model-graded assertions](/docs/configuration/expected-outputs/model-graded/)
- [OpenAI image provider](/docs/providers/openai#generating-images)
- [OpenAI images example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-images)
