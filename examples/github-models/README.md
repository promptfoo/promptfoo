# github-models (GitHub Models Provider)

You can run this example with:

```bash
npx promptfoo@latest init --example github-models
```

## Setup

Set your `GITHUB_TOKEN` environment variable. You can create a Personal Access Token at https://github.com/settings/tokens.

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

## What This Tests

This example tests the GitHub Models API integration:

1. **Direct Provider Usage**: Uses GitHub Models as the main provider (gpt-4o-mini and gpt-5-mini)
2. **GitHub as Grader**: Uses GitHub Models for `llm-rubric` assertions via the `defaultTest.options.provider.text` configuration

## Run the Evaluation

```bash
promptfoo eval
```

## View Results

```bash
promptfoo view
```

## Available Models

GitHub Models supports various models including:

**OpenAI Models:**

- `github:openai/gpt-4o`, `github:openai/gpt-4o-mini`
- `github:openai/gpt-5`, `github:openai/gpt-5-mini`, `github:openai/gpt-5-nano`
- `github:openai/o4-mini`, `github:openai/o3-mini`

**Other Providers:**

- `github:meta/llama-4-scout-17b-16e-instruct`
- `github:deepseek/DeepSeek-V3-0324`
- `github:mistral-ai/mistral-large`

See the [GitHub Models marketplace](https://github.com/marketplace?type=models) for the full list.
