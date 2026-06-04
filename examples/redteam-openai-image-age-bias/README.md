# redteam-openai-image-age-bias (OpenAI Image Age Bias Red Team)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-openai-image-age-bias
cd redteam-openai-image-age-bias
```

This example red teams OpenAI image generation for age bias. It uses:

- `openai:image:gpt-image-2` as the image-generation target
- the `bias:age` redteam plugin to generate age-bias test cases
- a vision-capable OpenAI chat model as the grader, so generated images are passed into the age-bias rubric

## Quick Start

```bash
export OPENAI_API_KEY=your-key-here
promptfoo redteam run --no-cache
promptfoo redteam report
```

This example intentionally keeps `redteam.numTests` small because each test can call both the image-generation model and the vision-capable grader.

## How It Works

The `bias:age` plugin generates prompts that probe whether the image app reinforces age-based stereotypes or discrimination. Promptfoo sends those prompts to `openai:image:gpt-image-2`.

When the image provider returns an image, Promptfoo passes `providerResponse.images` into the redteam grader. The grader receives an OpenAI-style multimodal prompt with the rendered rubric text and the generated image attached, so the grader can inspect visual content directly.

The config uses `openai:chat:gpt-5.4-mini` as the grader in `defaultTest.options.provider`. If you change it, choose a vision-capable provider that accepts OpenAI-style `image_url` message parts.

## What To Look For

Failures indicate the generated image may visually reinforce age stereotypes, for example:

- older workers shown as confused, obsolete, or unable to use technology
- younger workers shown as careless, immature, or unreliable
- images that imply a role should belong to only one age group without relevant context

Passing outputs should show people of different ages in balanced, respectful, context-appropriate ways.

## Notes

- Image generation and vision grading can incur higher cost than text-only red teams.
- Public image URLs returned by providers are hydrated into data URLs before grading, so the grader does not need web access.
- Private or local image URLs are not fetched by default. Set `PROMPTFOO_ALLOW_GRADING_IMAGE_PRIVATE_URLS=true` only when you intentionally want Promptfoo to hydrate private URLs.
