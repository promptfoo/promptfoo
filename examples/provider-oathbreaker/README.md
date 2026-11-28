# provider-oathbreaker (Oathbreaker)

Compare two Oathbreaker models on short coding questions, using promptfoo's OpenAI-compatible provider.

## Usage

```bash
npx promptfoo@latest init --example provider-oathbreaker
cd provider-oathbreaker
```

Create an API key and add prepaid credit in the [Oathbreaker console](https://oathbreaker.ai), then set `OATHBREAKER_API_KEY` in your environment. Then run:

```bash
npx promptfoo@latest eval
```

Both models use `max_tokens: 4096` and low reasoning effort. Reasoning tokens count toward the limit; increase it if a model runs out before answering. `showThinking: false` keeps reasoning out of the graded answer.

For current model IDs and limits, see the [Oathbreaker API reference](https://oathbreaker.ai/docs). See the [provider guide](https://www.promptfoo.dev/docs/providers/oathbreaker/) for configuration details.
