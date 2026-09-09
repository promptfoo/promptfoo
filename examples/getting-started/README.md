# getting-started (Getting Started Example)

You can run this example with:

```bash
npx promptfoo@latest init --example getting-started
cd getting-started
```

This is a simple example that demonstrates the basic functionality of promptfoo. It tests a translation prompt across two language models.

## Setup

1. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your-key-here
```

_Tip: you can also put this key in a `.env` file. Be sure not to commit it to git._

2. Run the evaluation:

```bash
promptfoo eval
```

## What's happening?

This example:

- Tests a translation prompt with different inputs
- Compares outputs between GPT-6 Astra and GPT-5.6 Luna using the OpenAI Responses API
- Uses two test cases with different languages and inputs

The config also includes commented-out alternatives for Claude Sonnet 5 and Gemini 3.8 Flash. To use them, set `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY`, respectively, and uncomment the provider.

The configuration in `promptfooconfig.yaml` shows:

- How to define prompts with variables using `{{variable_name}}`
- How to specify multiple providers (models)
- How to set up test cases with different variable values

This is the same example shown in the Getting Started guide at https://promptfoo.dev/docs/getting-started
