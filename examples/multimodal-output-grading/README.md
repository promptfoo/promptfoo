# multimodal-output-grading (Grade image outputs with a vision judge)

You can run this example with:

```bash
npx promptfoo@latest init --example multimodal-output-grading
```

This example shows how `llm-rubric` grades **image outputs**. When a provider returns images, promptfoo attaches them to the grading prompt as proper multimodal message parts, so a vision-capable judge inspects the actual pixels instead of a base64 string.

## Prerequisites

- `OPENAI_API_KEY` — used both to generate the images (`openai:image:gpt-image-1`) and to grade them (`openai:gpt-4o-mini`).

```bash
export OPENAI_API_KEY=sk-...
```

## Quick start

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
npx promptfoo@latest view
```

The red-bicycle prompt should pass its "red bicycle" rubric and the blue-bicycle prompt should pass its "blue bicycle" rubric — confirming the judge is reading the image, not guessing from the prompt text.

## How it works

- The target (`openai:image:gpt-image-1`) returns an image, which promptfoo exposes as `providerResponse.images`.
- `llm-rubric` detects the image output, replaces the base64/data-URI text with a short placeholder, and sends the real image to the grader formatted for the grader's API.
- The grading result metadata includes `renderedGradingPromptImages` (the number of attached images); the heavy base64 is not persisted to the results.

## Grading with a different provider

Set `defaultTest.options.provider` to any vision-capable grader:

```yaml
defaultTest:
  options:
    provider: anthropic:messages:claude-haiku-4-5
    # provider: bedrock:amazon.nova-lite-v1:0
    # provider: google:gemini-2.5-flash
    # provider: vertex:gemini-2.5-flash
```

Inline base64 / data-URI image outputs are supported, as are the `promptfoo://blob/<hash>` blob references promptfoo derives from them when it externalizes large image outputs — `llm-rubric` resolves those blobs back to inline data URIs before grading, so this works out of the box. Remote `http(s)://` image URLs are rejected so the grader never fetches arbitrary URLs. See the [llm-rubric docs](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/#grading-image-multimodal-outputs) for the full provider matrix and the `PROMPTFOO_GRADING_IMAGE_*` size limits.
