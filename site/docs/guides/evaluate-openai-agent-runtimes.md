---
title: Evaluate OpenAI agent runtimes
description: Compare OpenAI's hosted Agents API, TypeScript Agents SDK, and Codex app-server in Promptfoo. Grade the same receipt task using final answers, tools, and spans.
sidebar_position: 66
---

The same model can answer a question through three different agent runtimes. Choose the provider that exercises your application's code, tools, and workspace.

| If your application…                                 | Use this provider                                                            | What the eval exercises                                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creates sessions with OpenAI's Agents API            | [`openai:agents-api:<model>`](/docs/providers/openai-agents-api)             | OpenAI runs the agent. Each row gets a fresh session. Use `environment.type: none` for text tasks or `openai_hosted` to run commands against files you supply. |
| Defines an `Agent`, tools, or handoffs in TypeScript | [`openai:agents:<name>`](/docs/providers/openai-agents)                      | Promptfoo runs your `@openai/agents` code and can grade calls to your own functions. The suffix names the agent. Configure its model separately.               |
| Drives Codex through its client protocol             | [`openai:codex-app-server:<model>`](/docs/providers/openai-codex-app-server) | Promptfoo starts a local `codex app-server`. Test command and file events, approval decisions, or thread behavior against a local fixture directory.           |

## Run the same task three ways

The [receipt config](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-agents-api/promptfooconfig.compare.mjs) asks each agent for the receipt ID and net amount in cents. The hosted sandbox receives a copy of the receipt, the SDK agent reads it through a function tool, and Codex gets the same reader as a local MCP tool in a read-only configuration. Each row must return `{"receipt_id":"PF-7Q2K","net_cents":3316}`. The action checks use the evidence available to each runtime.

| Runtime           | Action to grade                                                                          | What a passing check establishes                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Hosted Agents API | `trajectory:tool-used` and `trajectory:tool-args-match` for `command_execution`          | A hosted command was recorded with `cwd: /workspace`. The tool summary separately records completion status. |
| TypeScript SDK    | `trajectory:tool-args-match` for `read_receipt`                                          | The agent called the application tool with the expected filename.                                            |
| Codex app-server  | `trajectory:tool-used` for `read_receipt` and `trace-error-spans` scoped to the MCP call | The protocol reported a call to the receipt tool and its span reported no error.                             |

Follow the [example setup instructions](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents-api/comparison#readme) for OpenAI project access, the TypeScript SDK, and the Codex CLI. From a Promptfoo source checkout, run the eval and inspect its rows:

```sh
npm run local -- eval -c examples/openai-agents-api/promptfooconfig.compare.mjs --no-cache -o receipts.json
jq '.results.results[] | {provider: .provider.id, success, score, output: .response.output,
  error: (.error // .response.error), checks: [.gradingResult.componentResults[]? | {pass, reason}]}' receipts.json
```

In two live runs, every agent returned the expected receipt. Before hosted trace import, the hosted row passed one of three checks because the two tool assertions saw no command. In the second run it imported four native spans and passed all three, including the check for `cwd: /workspace`. The SDK passed both checks in each run. Codex initially passed two of three because its completed MCP call had `error: null` and Promptfoo marked its span as failed. After Promptfoo recognized that successful protocol response, Codex passed all three.

Open a result in the local eval viewer and select **Traces** to inspect the spans. To check whether a hosted command completed, inspect `response.metadata.toolCalls`. A completed agent turn can contain a failed command. To check the command's arguments, explicitly opt in to recording them. [Hosted trace settings, permissions, and latency](/docs/providers/openai-agents-api#inspect-traces)

The hosted receipt check asks for `cwd: /workspace` as a subset. It can pass if that field was captured even when another argument was omitted. To verify every argument, choose `mode: exact` and require an intact matching call. [Tool argument assertions](/docs/configuration/expected-outputs/deterministic#trajectorytool-args-match)

## Separate instructions, input, and state

Put trusted routing policy in `agent.instructions` and the customer's ticket in the user prompt. On the hosted provider a JSON string that resembles a system message still arrives as user text. The [intake example](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-agents-api/promptfooconfig.intake.yaml) puts a test-controlled queue name in the instructions and an attempted policy override in the ticket. Its expected labels are `DAY-BILLING` for the invoice dispute and `NIGHT-ACCESS` for the role-shaped lockout ticket.

For a file task, put the data in the agent's workspace and keep the expected answer in the assertion. The [hosted ledger example](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-agents-api/promptfooconfig.files.yaml) keeps the prompt and path identical, changes the CSV, and expects `3316` for one file and `-4899` for the other. A third CSV includes a transaction note asking the agent to report `70000`. Expecting `1529` checks whether this particular indirect prompt injection changed the answer.

For file deliverables, grade the acknowledgment and the published file separately. In the ledger example, `artifactPaths` selects `/workspace/outputs/summary.csv`. Promptfoo hashes the file that the root turn published before deleting the session. The assertion compares that digest with the SHA-256 of the expected CSV. In a live control, increasing one entry from 17 to 18 cents changed the file total from 147 to 148. Both rows passed the `READY` check. Only the second row failed the file check when the expected CSV stayed fixed at 147. This check runs independently of trace export. [Published artifact example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents-api/artifacts) · [OpenAI's hosted report example](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted#example-create-a-report)

For conversational tests, choose where history lives. Hosted provider rows start independently even if they share an `agent_id`. The [SDK session example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents-advanced) explicitly shares a memory session across sequential tests. The app-server provider can resume a `thread_id`. If your own service handles follow-ups, client-side function calls, or a self-hosted executor, point a [Promptfoo HTTP provider](/docs/providers/http) at that service to exercise its lifecycle. [Cloudflare's file round trip](https://developers.cloudflare.com/sandbox/coding-agents/openai-agents-api/) and [E2B's session workbench](https://e2b.dev/resources/build-an-agent-workbench-on-openais-agents-api) illustrate these application-managed steps.

## Extend the eval to your agent

- **Hosted delegation.** Give two reviewers different release notes. Check that the root answer contains both facts, then require tool or trace evidence that the agent delegated the work. [OpenAI release-note reviewers](https://developers.openai.com/api/docs/guides/agents-api/multi-agent#example-compare-release-notes)
- **SDK handoffs.** A triage agent could calculate `42 × 17` itself. Check for both `714` and the recorded handoff to the math specialist. [Arize's TypeScript handoff example](https://github.com/Arize-ai/openinference/blob/ad1bbf4f042afe6b1146019e3039142c4ff2529a/js/packages/openinference-instrumentation-openai-agents/examples/handoff.ts)
- **Codex approvals.** For a shipment rebooking flow, decline the write, check the recorded approval decision, and independently verify the shipment stayed booked as before. [OpenAI's Relay example](https://developers.openai.com/blog/codex-as-a-platform#example-relay)
