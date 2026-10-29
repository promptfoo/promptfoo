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

When the selected model uses reasoning, its output budget may cover both reasoning tokens and the visible answer. Increase `max_tokens` if answers are truncated.

Use `max_tokens` rather than `max_completion_tokens`: promptfoo only forwards the latter for models it classifies as reasoning models, and Grid instrument names are not on that list.

Both providers select `THEGRID_API_KEY` with `apiKeyEnvar`. If that variable is unset or blank, promptfoo reports a missing-key error before sending a request; it does not fall back to `OPENAI_API_KEY`.
