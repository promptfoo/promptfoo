# provider-flexai (FlexAI)

Compare two FlexAI chat models and grade a similarity assertion with FlexAI's `bge-m3` embeddings, using promptfoo's OpenAI-compatible provider.

## Usage

```bash
npx promptfoo@latest init --example provider-flexai
cd provider-flexai
```

Create a key on the [FlexAI platform](https://platform.flex.ai) and set `FLEXAI_API_KEY` in your environment. Then run:

```bash
npx promptfoo@latest eval
```

Both chat models use `max_tokens: 4096` and low reasoning effort. Reasoning tokens count toward the limit; increase it if a model runs out before answering. `showThinking: false` keeps reasoning out of the graded answer.

For current model IDs, see the [FlexAI catalog](https://flex.ai/models). See the [provider guide](https://www.promptfoo.dev/docs/providers/flexai/) for configuration details.
