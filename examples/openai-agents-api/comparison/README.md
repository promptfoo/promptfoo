# Compare three agent runtimes on one receipt

Every provider receives the same prompt and receipt bytes. The receipt contains a synthetic ID, two charges, and one refund. Each provider requests `gpt-6-astra` with low reasoning effort. The shared `ReceiptAnswer` assertion compares the parsed JSON with `{"receipt_id":"PF-7Q2K","net_cents":3316}`.

| Runtime               | How it obtains the receipt                                                                                                                                        | Additional assertion                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted Agents API     | Opens an inline file in an OpenAI-hosted sandbox with network access disabled.                                                                                    | A native `command_execution` span records the working directory `/workspace`.                                                                         |
| TypeScript Agents SDK | Calls a local function that reads a single fixed file.                                                                                                            | A `read_receipt` tool call included the argument `filename: receipt.txt`.                                                                             |
| Codex app-server      | Calls the same reader through a local stdio MCP server. Its workspace is read-only and its temporary Codex home keeps this run separate from your other sessions. | A `read_receipt` tool span was recorded and the MCP span has no error. Inspect `response.metadata.codexAppServer.items` for its arguments and status. |

The answer check remains independent of the action checks. A recorded tool invocation can still fail. The SDK and app-server share a file reader, while the hosted runtime chooses a sandbox command. Each runtime supplies its own system instructions. This comparison tests their integration with Promptfoo.

In a live run on commit `204cf8f2`, all three answers passed. The hosted trace lacked its command span, and the app-server trace marked the successful MCP read as an error because the protocol returned `error: null`. Only the SDK passed every check. With native hosted trace import and the MCP status fix, all three passed. The hosted command was `cat receipt.txt` in `/workspace`; the app-server MCP span ended with OpenTelemetry status `OK`.

## Run

From the repository root, install dependencies and put a Codex CLI with GPT-6 Astra support on your PATH. Use the repo's Node version. Set `OPENAI_API_KEY` for a project with Agents API and Responses API permissions. Your OpenAI organization must enable native trace export for the hosted action check. See the [Codex app-server prerequisites](https://www.promptfoo.dev/docs/providers/openai-codex-app-server/) and [OpenAI trace export permissions](https://developers.openai.com/api/docs/guides/agents-api/tracing#export-session-traces).

```sh
npm run local -- eval -c examples/openai-agents-api/promptfooconfig.compare.mjs --no-cache -o receipt-results.json
```

If you downloaded the example separately, run these commands in its `openai-agents-api` directory:

```sh
npm install promptfoo @openai/agents@^0.14.1 @modelcontextprotocol/sdk@^1.32.1 zod@^4
npx promptfoo eval -c promptfooconfig.compare.mjs --no-cache -o receipt-results.json
```

Open the result details in your local Promptfoo UI to inspect each row's assertions and trace tree. You can also read the individual grades from the export:

```sh
jq '.results.results[] | {runtime: .provider.label, answer: .response.output,
  checks: [.gradingResult.componentResults[]? | {type: .assertion.type, pass, reason}]}' receipt-results.json
```

The hosted config opts into recording tool arguments so they can be inspected for this synthetic receipt. That setting can expose command contents. Runs create billable model requests, and the hosted sandbox can incur additional charges.
