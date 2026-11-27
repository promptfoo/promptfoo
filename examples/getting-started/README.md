# getting-started (Getting Started Example)

This example compares GPT-6 Sol and GPT-6 Luna on two translation tasks.

Initialize it with:

```bash
npx promptfoo@latest init --example getting-started
cd getting-started
```

## Setup

1. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your-key-here
```

To load the key from a `.env` file instead, add `--env-file .env` to the evaluation command. Do not commit the file.

2. Run the evaluation:

```bash
npx promptfoo@latest eval --no-cache
```

## What's happening?

In `promptfooconfig.yaml`, the prompt uses `{{language}}` and `{{input}}` variables. Each test supplies their values and checks for the expected translation. Both models run each test, producing four results.

The config also includes commented-out alternatives for Claude Sonnet 5 and Gemini 3.8 Flash. To use them, set `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY`, respectively, and uncomment the provider.

See the [Getting Started guide](https://promptfoo.dev/docs/getting-started) for a walkthrough.
