# openai-deep-research (OpenAI Deep Research Models)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-deep-research
```

This example demonstrates OpenAI's deep research models with web search capabilities via the Responses API.

## Setup

1. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your-key-here
```

_Note: Deep research models may require special access from OpenAI._

2. Run the evaluation:

```bash
promptfoo eval
```

## What's happening?

This example:

- Tests OpenAI's `o4-mini-deep-research` model with web search tools
- Evaluates research capabilities on machine learning and space exploration topics
- Uses the model's ability to automatically search the web for current information
- Checks that responses contain relevant technical terminology

The model automatically decides when to use web search to provide comprehensive, up-to-date answers.

## Learn More

- [OpenAI Deep Research Guide](https://platform.openai.com/docs/guides/deep-research)
- [Promptfoo Documentation](https://promptfoo.dev/docs)
