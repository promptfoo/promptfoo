# google-interactions (Gemini Interactions API)

Compare Google's `generateContent` and [Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview) APIs for chat, then run function calls through Interactions.

## Run the examples

```bash
npx promptfoo@latest init --example google-interactions
cd google-interactions
```

Set `GOOGLE_API_KEY` or `GEMINI_API_KEY`. Ordinary `google:` providers use `generateContent`; select Interactions with `google:interactions:<model>` or `config.interactions: true`.

| Config                       | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `promptfooconfig.yaml`       | Compare both APIs and both ways to select Interactions      |
| `promptfooconfig.tools.yaml` | Return a pending function call, or run a callback to answer |

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache
promptfoo eval -c promptfooconfig.tools.yaml --no-cache
```

With `functionToolCallbacks`, promptfoo runs each requested function and sends the result back until the model answers, for up to eight rounds. Without a matching callback, the function call is returned as output so assertions such as `is-valid-function-call` can inspect it.
