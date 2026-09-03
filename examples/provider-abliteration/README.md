# provider-abliteration (Abliteration)

Run text and image evals against Abliteration:

```bash
npx promptfoo@latest init --example provider-abliteration
cd provider-abliteration
```

## Prerequisites

Create an API key in the [Abliteration console](https://abliteration.ai/console)
with access to the model you want to test.

## Setup

Set your API key:

```bash
export ABLIT_KEY=your-key-here
```

## Run

For security weakness classification with `abliterated-model-large-v2`:

```bash
npx promptfoo@latest eval -c promptfooconfig.large-v2.yaml --no-cache
```

For image recognition with `abliterated-model`:

```bash
npx promptfoo@latest eval --no-cache
```

The text eval uses low reasoning effort. The image eval disables reasoning;
Large V2 accepts text only and cannot run the image eval.

See the [provider docs](https://www.promptfoo.dev/docs/providers/abliteration/)
for model capabilities and reasoning settings.
