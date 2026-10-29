# openai-agents-api (OpenAI Hosted Agents API)

Each row starts a fresh Agents API session. Start with ticket intake to check your project access without a sandbox. Use the ledger eval to inspect a real sandbox command in the results UI.

## Setup

Use an OpenAI project key with `api.agents.read`, `api.agents.write`, and `api.responses.write` permissions. Set `OPENAI_API_KEY` in your terminal, or pass `--env-file .env` to the eval if your key is in that file. Keep the key outside the agent's sandbox.

```sh
npx promptfoo@latest init --example openai-agents-api
cd openai-agents-api
npx promptfoo@latest eval -c promptfooconfig.intake.yaml --no-cache -o intake.json
```

For the ledger eval, enable trace export for your OpenAI organization. The project key needs `api.traces.read` or `api.agents.read`. The config opts into recording tool arguments for these synthetic files.

```sh
npx promptfoo@latest eval -c promptfooconfig.files.yaml --no-cache -o ledger.json
npx promptfoo@latest view
```

Select a ledger result, open **View output and test details**, then **Traces**. Expand `execute_tool command_execution` to inspect the filename and working directory. In **Evaluation**, compare the `LedgerFilename`, `Workspace` and `CommandErrors` checks with the expected answer.

From the repository root, use the local CLI:

```sh
npm run local -- eval -c examples/openai-agents-api/promptfooconfig.files.yaml --no-cache -o ledger.json
```

## What the examples check

| Config                                             | Input                                                                                                                                                                                 | Passing evidence                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Ticket intake](./promptfooconfig.intake.yaml)     | A plain invoice dispute and a lockout ticket containing a fake system message. The trusted queue prefix goes in `agent.instructions`, while the whole ticket goes in the user prompt. | Exact routing labels `DAY-BILLING` and `NIGHT-ACCESS`.                                                                                                                               |
| [Arithmetic](./promptfooconfig.yaml)               | Two lists of numbers in the user prompt.                                                                                                                                              | Valid JSON with the expected sum and count, plus a completed command in the root turn.                                                                                               |
| [Ledger files](./promptfooconfig.files.yaml)       | The same prompt against three different CSVs mounted at `/workspace/ledger.csv`. Sandbox networking is disabled.                                                                      | Exact amounts of `3316`, `-4899`, and `1529`, including an injected transaction note. The trace must show the filename, a command in `/workspace`, and zero reported command errors. |
| [Published artifact](./artifacts/README.md)        | The agent reads a ledger, writes `/workspace/outputs/summary.csv`, and replies `READY`.                                                                                               | The acknowledgement and the SHA-256 digest of the published CSV, including the final newline.                                                                                        |
| [Three-runtime comparison](./comparison/README.md) | The hosted Agents API, TypeScript Agents SDK, and Codex app-server receive the same task and receipt bytes.                                                                           | The same expected receipt ID and total, with a separate assertion on each runtime's observed tool use.                                                                               |

The arithmetic and ledger checks match the tool item's type, status, and root turn ID in `context.providerResponse.metadata`. To inspect the shell exit code, open the command's saved item in OpenAI. The ledger config also enables native trace import. The root command summary and the native trace are independent sources of action evidence.

## Inspect the results

Use the JSON export to see which check failed when the final answer looks correct:

```sh
jq '.results.results[] | {success, score, error, output: .response.output,
  checks: [.gradingResult.componentResults[]? | {type: .assertion.type, pass, reason}],
  metadata: .response.metadata}' ledger.json
```

If an action check fails, inspect `response.metadata.hostedTrace.status` and `reason` first. A partial tree can show a tool call while leaving its total count unknown. [Diagnose missing trace evidence](https://www.promptfoo.dev/docs/providers/openai-agents-api/#diagnose-missing-trace-evidence)

Check `response.metadata.sessionDeleted` for normal provider cleanup. To inspect a successful session in OpenAI after an eval, set `retainSession: true`, then delete it yourself. Trace export requires organization enablement. [OpenAI tracing guide](https://developers.openai.com/api/docs/guides/agents-api/tracing#export-session-traces)

Model usage, tools, and sandbox time are billable. Promptfoo estimates the model-token portion. [Runtime comparison guide](https://www.promptfoo.dev/docs/guides/evaluate-openai-agent-runtimes/) · [Provider reference](https://www.promptfoo.dev/docs/providers/openai-agents-api/) · [OpenAI quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart)
