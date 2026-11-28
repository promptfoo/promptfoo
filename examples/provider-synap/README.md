# provider-synap (Synap)

Compare two Synap chat models and grade a rubric assertion with Synap itself, using promptfoo's OpenAI-compatible provider.

## Usage

```bash
npx promptfoo@latest init --example provider-synap
cd provider-synap
```

Create a key on your [Synap account page](https://synap.linkrra.com/ai/account.html) and set `SYNAP_API_KEY` in your environment. Then run:

```bash
npx promptfoo@latest eval
```

`qwen3-coder-30b` is covered by the [free tier](https://synap.linkrra.com/free.html); `gpt-oss-20b` and the rubric grader draw on credits. `gpt-oss-20b` returns a separate reasoning field, so `showThinking: false` keeps that text out of the graded answer.

For current model IDs, see the [Synap catalog](https://synap.linkrra.com/models) or `GET https://synap.linkrra.com/v1/models`. See the [provider guide](https://www.promptfoo.dev/docs/providers/synap/) for configuration details.
