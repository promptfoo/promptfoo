# provider-abliteration (Abliteration)

Test security weakness classification with Abliteration Large V2:

```bash
npx promptfoo@latest init --example provider-abliteration
cd provider-abliteration
```

## Setup

Create an API key in the [Abliteration console](https://abliteration.ai/console)
with access to `abliterated-model-large-v2`, then set it in your shell:

```bash
export ABLIT_KEY=your-key-here
```

## Run

```bash
npx promptfoo@latest eval --no-cache
```

See the [provider docs](https://www.promptfoo.dev/docs/providers/abliteration/)
for reasoning settings and the base model's image example.
