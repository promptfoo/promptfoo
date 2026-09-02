# provider-abliteration (Abliteration)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-abliteration
cd provider-abliteration
```

## Prerequisites

- An [Abliteration](https://abliteration.ai/) account and API key.
- Access to `abliterated-model-large-v2` for the text eval, or
  `abliterated-model` for the image eval.

## Setup

1. Set your API key:

   ```bash
   export ABLIT_KEY=your-key-here
   ```

2. Choose the text or image config below. Large V2 is text-only, so it cannot
   be used with the image prompt.

## Run

To evaluate GLM-5.3-based **Large V2** on security weakness classification:

```bash
npx promptfoo@latest eval -c promptfooconfig.large-v2.yaml --no-cache
```

The config uses `reasoning_effort: low` and `max_tokens: 16384`. Large V2 also
supports `high` and `max` effort. It always reasons; `none` selects low effort
with the trace hidden. Promptfoo hides reasoning from graded output by default.

To run the base model's image example:

```bash
npx promptfoo@latest eval --no-cache
```

See [the Abliteration provider docs](https://www.promptfoo.dev/docs/providers/abliteration/)
for safety context and additional configuration options.
