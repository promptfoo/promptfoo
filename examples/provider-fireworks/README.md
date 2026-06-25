# provider-fireworks (Fireworks AI)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-fireworks
cd provider-fireworks
```

## Usage

Set your `FIREWORKS_API_KEY` environment variable. You can get a key from [fireworks.ai](https://fireworks.ai), sign in, open **Settings -> API Keys**, and create one.

Then run:

```bash
promptfoo eval
```

View the results with `promptfoo view`.

## What this shows

- Three Fireworks **serverless** chat models (`gpt-oss-120b`, `deepseek-v4-pro`, `kimi-k2p6`) compared on a summarisation task. These are reasoning models, so `max_tokens` is set high enough to leave room for hidden reasoning tokens plus the visible answer.
- A `similar` assertion graded by a Fireworks **embedding** model via the `fireworks:embedding:` prefix.

Models rotate in and out of the serverless tier — if a model 404s, pick a current one from the [serverless catalogue](https://fireworks.ai/models?deployment=serverless).
