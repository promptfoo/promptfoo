---
sidebar_label: CometAPI
---

# CometAPI

The `cometapi` provider lets you use [CometAPI](https://www.cometapi.com/?utm_source=promptfoo&utm_campaign=integration&utm_medium=integration&utm_content=integration) via OpenAI-compatible endpoints. It supports hundreds of models across vendors.

## Quick Start

- Run with the included example config (from this repo root):

```bash
export COMETAPI_KEY=<your_api_key>
npm run local -- eval -c examples/cometapi/promptfooconfig.yaml
```

- Or run a one-off prompt against a CometAPI model:

```bash
export COMETAPI_KEY=<your_api_key>
npm run local -- eval --prompts "Say hello in one sentence" -r cometapi:chat:gpt-5-mini
```

Note: `init --example <name>` downloads from the upstream promptfoo/promptfoo repo. If the `cometapi` example isn’t published yet, you’ll see “Not Found.”

### Alternative: Using the compiled build

If you prefer to build first, you can use the compiled output directly:

```bash
export COMETAPI_KEY=<your_api_key>
npm run build
node dist/src/main.js eval --prompts "Say hello in one sentence" -r cometapi:chat:chatgpt-4o-latest
```

Or run with the bundled example config:

```bash
export COMETAPI_KEY=<your_api_key>
npm run build
node dist/src/main.js eval -c examples/cometapi/promptfooconfig.yaml
```

## Setup

Set your API key as an environment variable:

```bash
export COMETAPI_KEY=<your_api_key>
```

If you don’t have an API key yet, get one at 👉 https://api.cometapi.com/console/token

## Provider Usage

The syntax follows:

```yaml
providers:
  - cometapi:<type>:<model>
```

Where `<type>` can be:

- `chat`
- `completion`
- `embedding`

You can also use `cometapi:<model>` to default to chat-completion mode.

### Example

```yaml
providers:
  - cometapi:chat:chatgpt-4o-latest
  - cometapi:completion:deepseek-chat
  - cometapi:embedding:text-embedding-3-small
```

All standard OpenAI-style parameters are supported, such as:

```yaml
temperature: 0.7
max_tokens: 512
```

## Command-line Examples

Run a quick one-off prompt with a CometAPI model:

```bash
export COMETAPI_KEY=your_api_key_here
npx promptfoo@latest eval --prompts <(printf "Say hello in one sentence\n") -r cometapi:chat:chatgpt-4o-latest
```

Compare several CometAPI models side-by-side:

```bash
npx promptfoo@latest eval --prompts <(printf "Summarize the following text: {{text}}\n") \
  --var text="Large language models are powerful tools for..." \
  -r cometapi:chat:gpt-5-mini cometapi:chat:claude-sonnet-4-20250514 cometapi:chat:gemini-2.5-flash
```

Tune parameters inline for a provider:

```bash
npx promptfoo@latest eval --prompts <(printf "Write a haiku about databases\n") \
  -r cometapi:chat:gpt-5-mini \
  --providers.0.config.temperature=0.3 \
  --providers.0.config.max_tokens=200
```

Use the included example config:

```bash
npx promptfoo@latest eval -c examples/cometapi/promptfooconfig.yaml
```

## Available Models

Fetch the list of available models:

### Method 1: Using curl

```bash
curl -H "Authorization: Bearer $COMETAPI_KEY" https://api.cometapi.com/v1/models
```

### Method 2: Accessing via the [CometAPI Pricing Page](https://api.cometapi.com/pricing)

Note: The CometAPI models list includes non-chat models. Promptfoo filters obvious non-chat types using ignore patterns to make selection easier.

## Environment Variables

| Variable       | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| `COMETAPI_KEY` | Your CometAPI key. Get one at https://api.cometapi.com/console/token |
