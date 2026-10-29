# openai-agents-api (OpenAI Hosted Agents API)

Evaluate a support router without a sandbox, grade a file produced in an OpenAI-hosted sandbox, or give three agent runtimes the same receipt. Each hosted row starts a fresh Agents API session.

## Setup

Use an OpenAI project key with `api.agents.read`, `api.agents.write`, and `api.responses.write` permissions. Set `OPENAI_API_KEY` in your terminal, or pass `--env-file .env` to the eval if your key is in that file. Keep the key outside the agent's sandbox.

```sh
npx promptfoo@latest init --example openai-agents-api
cd openai-agents-api
npx promptfoo@latest eval -c promptfooconfig.intake.yaml --no-cache -o intake.json
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache -o arithmetic.json
npx promptfoo@latest eval -c promptfooconfig.files.yaml --no-cache -o ledger.json
```

From the repository root, use the local CLI. For example:

```sh
npm run local -- eval -c examples/openai-agents-api/promptfooconfig.files.yaml --no-cache -o ledger.json
```

## What the examples check

| Config                                             | Input                                                                                                                                                                                 | Passing evidence                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Ticket intake](./promptfooconfig.intake.yaml)     | A plain invoice dispute and a lockout ticket containing a fake system message. The trusted queue prefix goes in `agent.instructions`, while the whole ticket goes in the user prompt. | Exact routing labels `DAY-BILLING` and `NIGHT-ACCESS`.                                                                                                                                                               |
| [Arithmetic](./promptfooconfig.yaml)               | Two lists of numbers in the user prompt.                                                                                                                                              | Valid JSON with the expected sum and count, plus a completed command in the root turn.                                                                                                                               |
| [Ledger files](./promptfooconfig.files.yaml)       | The same prompt against three different CSVs mounted at `/workspace/ledger.csv`. Sandbox networking is disabled.                                                                      | Exact net amounts of `3316`, `-4899`, and `1529` cents, including a note that asks the agent to report a different number, a completed root command, and an `invoke_agent` span in Promptfoo's local trace receiver. |
| [Published artifact](./artifacts/README.md)        | The agent reads a ledger, writes `summary.csv`, and replies `READY`.                                                                                                                  | The acknowledgement and an independent byte-for-byte comparison of the published file, including the final newline.                                                                                                  |
| [Three-runtime comparison](./comparison/README.md) | The hosted Agents API, TypeScript Agents SDK, and Codex app-server receive the same task and receipt bytes.                                                                           | The same expected receipt ID and total, with a separate assertion on each runtime's observed tool use.                                                                                                               |

The arithmetic and ledger checks match the tool item's type, status, and root turn ID in `context.providerResponse.metadata`. To inspect the shell exit code, open the command's saved item in OpenAI. To grade hosted tool names in Promptfoo, enable both eval tracing and the provider's `hostedTrace` option. The comparison shows the opt-in and how to inspect the resulting spans.

## Inspect the results

Use the JSON export to see which check failed when the final answer looks correct:

```sh
jq '.results.results[] | {success, score, error, output: .response.output,
  checks: [.gradingResult.componentResults[]? | {type: .assertion.type, pass, reason}],
  metadata: .response.metadata}' ledger.json
```

Open `promptfoo view` after running an eval. Select a result and open **Traces** to inspect its spans. For an import, check `response.metadata.hostedTrace.status` in the row's metadata. Check `response.metadata.sessionDeleted` for normal provider cleanup. To inspect a successful session in OpenAI after an eval, set `retainSession: true`, then delete it yourself. The artifact example handles deletion in its grader. Trace export requires organization enablement. [OpenAI tracing guide](https://developers.openai.com/api/docs/guides/agents-api/tracing#export-session-traces)

Model usage, tools, and sandbox time are billable. Promptfoo estimates the model-token portion. [Runtime comparison guide](https://www.promptfoo.dev/docs/guides/evaluate-openai-agent-runtimes/) · [Provider reference](https://www.promptfoo.dev/docs/providers/openai-agents-api/) · [OpenAI quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)
