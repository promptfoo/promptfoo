# provider-wally (Wally)

Compare two Wally open-weight chat models using promptfoo's OpenAI-compatible provider.

## Usage

```bash
npx promptfoo@latest init --example provider-wally
cd provider-wally
```

Create a key in the [RunAnywhere console](https://console.runanywhere.ai) and set `WALLY_API_KEY` in your environment. Then run:

```bash
npx promptfoo@latest eval
```

Both models use `max_tokens: 4096` and low reasoning effort. Reasoning tokens count toward the limit; increase it if a model runs out before answering. `showThinking: false` keeps reasoning out of the graded answer.

For current model IDs, see `GET https://inference.runanywhere.ai/v1/models`. See the [provider guide](https://www.promptfoo.dev/docs/providers/wally/) for configuration details.
