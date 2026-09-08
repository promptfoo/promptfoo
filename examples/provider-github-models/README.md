# provider-github-models (GitHub Models Provider)

> **Retired example:** [GitHub Models retired on July 30, 2026](https://docs.github.com/en/github-models), including its inference API. This configuration is retained as a historical reference and no longer runs. Choose another provider and its own credentials; GitHub Copilot is a separate service.

The original configuration is preserved in [historical-config.yaml](./historical-config.yaml). Its archive filename keeps this retired example out of the interactive list of runnable examples.

<details>
<summary>Historical setup and usage</summary>

Before retirement, this example was initialized with:

```bash
npx promptfoo@latest init --example provider-github-models
cd provider-github-models
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

</details>
