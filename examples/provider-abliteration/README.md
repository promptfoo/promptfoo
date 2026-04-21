# provider-abliteration (Abliteration)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-abliteration
cd provider-abliteration
```

## Prerequisites

- An [Abliteration](https://abliteration.ai/) account and API key.
- Access to the `abliterated-model` model, or another model ID available on
  your account.

## Setup

1. Set your API key:

   ```bash
   export ABLIT_KEY=your-key-here
   ```

2. The example uses Abliteration's default `abliterated-model`. Replace it in
   `promptfooconfig.yaml` only if your account should target a different model.

## Run

```bash
promptfoo eval
```

See [the Abliteration provider docs](https://www.promptfoo.dev/docs/providers/abliteration/)
for safety context and additional configuration options.
