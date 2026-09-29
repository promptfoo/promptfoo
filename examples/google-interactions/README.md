# google-interactions (Gemini Interactions API)

Compare Google's `generateContent` and [Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview) chat APIs, then try function callbacks and stored interaction IDs.

```bash
npx promptfoo@latest init --example google-interactions
cd google-interactions
```

Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` before running the AI Studio examples. Ordinary `google:` providers use `generateContent`; select Interactions with `google:interactions:` or `config.interactions: true`.

| Config                          | Purpose                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `promptfooconfig.yaml`          | Compare both transports and both Interactions opt-in styles |
| `promptfooconfig.tools.yaml`    | Inspect pending function calls and run a local callback     |
| `promptfooconfig.stateful.yaml` | Enable storage and return an interaction ID                 |
| `promptfooconfig.vertex.yaml`   | Use Vertex OAuth, global routing, and stored interactions   |

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache
promptfoo eval -c promptfooconfig.tools.yaml --no-cache
promptfoo eval -c promptfooconfig.stateful.yaml --no-cache -o stored.json
```

AI Studio chat requests default to `store: false`. The stateful example enables storage; to continue one of its conversations, copy the result's `metadata.interactionId` into `config.previousInteractionId` for a later request. Storage is separate from other Google data-use policies.

For Vertex, configure a Google Cloud project and run `gcloud auth application-default login`. The example uses `region: global` and explicitly enables storage. Vertex chat rejects `store: false` and previous interaction IDs; pass prior turns inline. Check current model availability before running it:

```bash
promptfoo eval -c promptfooconfig.vertex.yaml --no-cache
```

The chat adapter rejects controls it cannot preserve, including safety settings, required tool choices, thinking token budgets, MCP, and configured search-retrieval options. Keep those configurations on `generateContent`. Chat requests bypass Promptfoo's persistent cache.
