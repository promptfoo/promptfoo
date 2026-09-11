# openai-agents-api (OpenAI Hosted Agents API)

Evaluate OpenAI's managed Codex harness. The agent runs Python in an OpenAI-hosted sandbox and returns structured results for two arithmetic tasks.

## Setup

Your OpenAI project API key needs `api.agents.read`, `api.agents.write`, and `api.responses.write` permissions. Keep the key in your terminal environment, outside the agent sandbox.

```sh
export OPENAI_API_KEY=your-api-key
npx promptfoo@latest init --example openai-agents-api
cd openai-agents-api
npx promptfoo@latest eval --no-cache -o results.json
```

From a Promptfoo source checkout, run from the repository root:

```sh
npm run local -- eval -c examples/openai-agents-api/promptfooconfig.yaml --no-cache -o results.json
```

Add `--env-file .env` if your key is in that file.

## Inspect the results

Both tests should pass, returning sums of `60` and `10` with counts of `3` and `4`. Inspect `results.results` in the JSON export for `success`, `score`, errors, and `response.output`. The response metadata includes the session ID, turn ID, tool-call types and statuses, and whether session deletion succeeded. Check for a completed `command_execution` to confirm the agent used its sandbox.

Each test creates its own session, and Promptfoo deletes it after collecting the output and final token usage. Set `retainSession: true` in provider config to keep successful sessions for inspecting or downloading artifacts. Retained sessions must be deleted separately when no longer needed. Executions are not cached.

Model usage, tools, and sandbox time are billable. Promptfoo's cost estimate covers model tokens only.

See [provider documentation](https://www.promptfoo.dev/docs/providers/openai-agents-api/) and the [OpenAI quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart).
