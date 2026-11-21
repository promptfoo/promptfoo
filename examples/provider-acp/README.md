# provider-acp (Compare agents over ACP)

Install and authenticate the agents you want to evaluate using the [ACP provider guide](https://www.promptfoo.dev/docs/providers/acp/). Each selected CLI runs one independent session per test.

## Run the comparison

```sh
npx promptfoo@latest init --example provider-acp
cd provider-acp
npx promptfoo@latest eval --no-cache
```

To run only the Copilot CLI preset, use `npx promptfoo@latest eval --filter-providers acp:copilot --no-cache`.
