# provider-thegrid (The Grid AI)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-thegrid
cd provider-thegrid
```

## Usage

[The Grid AI](https://thegrid.ai) is an OpenAI-compatible inference marketplace, so this example uses the generic `openai:chat:` provider with `apiBaseUrl`. There is no separate `thegrid:` provider.

Model names are capability tiers (`text-standard`, `code-prime`, `agent-max`) rather than a lab's model name.

To get started, set your `THEGRID_API_KEY` environment variable.

Next, edit promptfooconfig.yaml.

Then run:

```bash
promptfoo eval
```

```bash
promptfoo view
```

## Note on token budgets

Instruments reason before answering, and reasoning tokens count toward the output budget without appearing in the response. `max_tokens` is set generously here for that reason; lowering it too far truncates the visible answer.

Use `max_tokens` rather than `max_completion_tokens`: promptfoo only forwards the latter for models it classifies as reasoning models, and Grid instrument names are not on that list.

`THEGRID_API_KEY` must be set. Both providers name it with `apiKeyEnvar`, so a missing key fails locally rather than falling back to `OPENAI_API_KEY`, and both send an empty `OpenAI-Organization` header so an ambient `OPENAI_ORGANIZATION` is not forwarded to `api.thegrid.ai`. `showThinking: false` keeps reasoning out of the graded output.
