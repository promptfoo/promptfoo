# provider-thegrid (The Grid)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-thegrid
cd provider-thegrid
```

## Usage

[The Grid](https://thegrid.ai) is an OpenAI-compatible inference marketplace, so this example uses the generic `openai:chat:` provider with `apiBaseUrl` — there is no separate `thegrid:` provider.

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

`THEGRID_API_KEY` must be set. If it is missing and `OPENAI_API_KEY` is present, the OpenAI provider falls back to `OPENAI_API_KEY`.
