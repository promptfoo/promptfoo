# openai-codex-sdk/comprehensive (Comprehensive Codex SDK Testing)

A comprehensive example testing various Codex SDK features including:

- Multiple reasoning effort levels (low, high, xhigh)
- Basic code generation
- Codebase understanding
- Code analysis

## Usage

```bash
npx promptfoo@latest init --example openai-codex-sdk/comprehensive
npx promptfoo@latest eval
```

## Provider Configurations

This example includes three provider configurations:

1. **codex-basic** - Default settings with `high` reasoning
2. **codex-fast** - Minimal reasoning (`low`) for faster/cheaper responses
3. **codex-thorough** - Maximum reasoning (`xhigh`) for most thorough analysis

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key

## Model Options

The default model is `gpt-5.2-codex`. Other available models:

- `gpt-5.1-codex` - Previous generation (supports: low, medium, high reasoning)
- `gpt-5.1-codex-max` - Max variant (supports: low, medium, high, xhigh reasoning)

## Reasoning Effort Levels

Different reasoning levels have different capabilities:

| Level   | Description             | Models                     |
| ------- | ----------------------- | -------------------------- |
| none    | No reasoning            | gpt-5.2                    |
| minimal | Very brief reasoning    | gpt-5.2                    |
| low     | Quick reasoning         | All models                 |
| medium  | Balanced reasoning      | All models                 |
| high    | Thorough reasoning      | All models                 |
| xhigh   | Maximum reasoning depth | gpt-5.2, gpt-5.1-codex-max |
