# provider-hopbase (HopBase)

Compare GPT-6.1 Sol, GLM-5.3, and Claude Sonnet 5.5 through HopBase, and grade an `llm-rubric` assertion with a HopBase model. The GPT and GLM models use promptfoo's OpenAI-compatible provider; Claude uses the Anthropic Messages provider with a custom base URL.

## Usage

```bash
npx promptfoo@latest init --example provider-hopbase
cd provider-hopbase
```

Create a key in the [HopBase console](https://api.hop-base.com/login) and set `HOPBASE_API_KEY` in your environment. Then run:

```bash
npx promptfoo@latest eval
```

`glm-5.3` is a reasoning model, so it uses `max_tokens: 1024`; with a small limit, reasoning can use the whole budget before an answer appears. `showThinking: false` keeps reasoning out of the graded answer.

To see which model IDs your key can call, request `GET https://api.hop-base.com/v1/models`. See the [provider guide](https://www.promptfoo.dev/docs/providers/hopbase/) for configuration details.
