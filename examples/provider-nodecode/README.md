# provider-nodecode (Nodecode)

Ask Nodecode's Cyber v1 two short security questions and check the answers, using promptfoo's OpenAI-compatible provider.

## Usage

```bash
npx promptfoo@latest init --example provider-nodecode
cd provider-nodecode
```

Create a key at [nodecode.ai/account/keys](https://nodecode.ai/account/keys) and set `NODECODE_API_KEY` in your environment. Then run:

```bash
npx promptfoo@latest eval
```

The provider uses `max_tokens: 300` and low reasoning effort. Reasoning tokens count toward the limit; increase it if the model runs out before answering. `showThinking: false` keeps reasoning out of the graded answer.

See the [provider guide](https://www.promptfoo.dev/docs/providers/nodecode/) for configuration details.
