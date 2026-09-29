# google-interactions (Gemini Interactions API)

These examples show Promptfoo's default Interactions chat route, explicit routing, function callbacks, and fallback to `generateContent`.

```bash
npx promptfoo@latest init --example google-interactions
cd google-interactions
```

Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` for AI Studio. The Vertex example requires a Google Cloud project and OAuth credentials, such as those from `gcloud auth application-default login`.

| Config                          | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `promptfooconfig.yaml`          | Compare the default, explicit Interactions, and legacy routes |
| `promptfooconfig.tools.yaml`    | Return function calls or resolve them with callbacks          |
| `promptfooconfig.stateful.yaml` | Opt into server-side history                                  |
| `promptfooconfig.fallback.yaml` | Preserve settings through `generateContent`                   |
| `promptfooconfig.vertex.yaml`   | Opt into Vertex Interactions                                  |

AI Studio chat defaults to `store: false`. Set `store: true` to retain a conversation and reuse its `metadata.interactionId` as `previousInteractionId`. Vertex uses stored interactions but does not support previous-interaction references in this adapter. Check model availability before running the Vertex example.

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache
promptfoo eval -c promptfooconfig.tools.yaml --no-cache
promptfoo eval -c promptfooconfig.fallback.yaml --no-cache
```

See the [provider documentation](https://www.promptfoo.dev/docs/providers/google/#interactions-api) for supported mappings and retention behavior.
