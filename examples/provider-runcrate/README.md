# provider-runcrate (Runcrate)

Compare two Runcrate chat models on the same prompts, using promptfoo's OpenAI-compatible provider.

## Usage

```bash
npx promptfoo@latest init --example provider-runcrate
cd provider-runcrate
```

Create an API key in your Runcrate account (see the [Runcrate docs](https://www.runcrate.ai/docs)) and set `RUNCRATE_API_KEY` in your environment. Then run:

```bash
npx promptfoo@latest eval
```

Both models use `max_tokens: 1024`. Reasoning tokens count toward the limit; increase it if a model runs out before answering. `showThinking: false` keeps reasoning out of the graded answer.

For current model IDs, call `GET https://api.runcrate.ai/v1/models`. See the [provider guide](https://www.promptfoo.dev/docs/providers/runcrate/) for configuration details.
