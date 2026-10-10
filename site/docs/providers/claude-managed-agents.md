---
title: Claude Managed Agents
description: Evaluate hosted Claude Managed Agents and dynamic workflows with isolated sessions, workflow completion checks, token and cost reporting, and automatic cleanup.
sidebar_position: 3
---

# Claude Managed Agents

The `anthropic:managed-agents` provider evaluates [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/quickstart), Anthropic's hosted agent service. It uses `client.beta.agents`, `client.beta.environments`, and `client.beta.sessions` from the Anthropic SDK included with Promptfoo.

For agents running locally through Claude Code, use the [Claude Agent SDK provider](./claude-agent-sdk.md#dynamic-workflows).

## Existing agents

Set `ANTHROPIC_API_KEY` to a key with Managed Agents access, then provide your agent and cloud environment IDs:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - '{{question}}'
providers:
  - id: anthropic:managed-agents
    config:
      agent_id: agent_your_agent
      environment_id: env_your_environment
tests:
  - vars:
      question: What is 17 plus 25? Reply with only the number.
    assert:
      - type: equals
        value: '42'
```

You can also put the agent ID in the provider ID: `anthropic:managed-agents:agent_your_agent`. That ID takes precedence over `config.agent_id`. Use `agent_version` to pin an existing agent's version.

## Create an agent with dynamic workflows

Use `agent` instead of `agent_id` to create a temporary agent, and `environment` instead of `environment_id` to create a cloud environment. These objects use the Anthropic API's field names. Config values support Promptfoo templates.

```yaml
providers:
  - id: anthropic:managed-agents
    config:
      agent:
        name: Document reviewer
        model: claude-sonnet-5
        system: Use a dynamic workflow to review each supplied document, then combine the findings.
        multiagent:
          type: multiagent_20261001
          workflows:
            type: enabled
          subagents:
            type: disabled
      environment:
        name: Review environment
        config:
          type: cloud
          networking:
            type: limited
            allowed_hosts: []
            allow_package_managers: false
      session:
        budget:
          type: limit
          max_list_cost:
            amount: '100'
            currency: USD
```

The budget is in whole **cents**, so `'100'` means $1 of list-cost usage. Configure the agent's `tools`, `mcp_servers`, `skills`, and workflow `predefined_agents` as needed. See Anthropic's [multiagent configuration](https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration) for inline agents and predefined agent rosters.

Enabling workflows gives the agent access to them; your prompt should ask it to use one. Promptfoo waits until every observed workflow run has ended and a subsequent main-session idle event reports `end_turn`. An early progress message or an idle child thread does not finish the eval.

## Configuration

| Option                           | Description                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `agent_id` / `agent`             | Exactly one: existing agent ID or agent creation parameters (`name` and `model` required).                                        |
| `agent_version`                  | Optional positive version number for `agent_id`.                                                                                  |
| `environment_id` / `environment` | Exactly one: existing cloud environment ID or environment creation parameters (`name` required).                                  |
| `session`                        | Session `title`, `metadata`, `resources`, `vault_ids`, and `budget`.                                                              |
| `apiKey`                         | Overrides `ANTHROPIC_API_KEY`. Claude Code subscription OAuth is not supported by this hosted API.                                |
| `apiBaseUrl`                     | Overrides `ANTHROPIC_BASE_URL`; defaults to the Anthropic API.                                                                    |
| `headers`                        | Additional request headers.                                                                                                       |
| `workspace_id`                   | Optional Anthropic workspace selector.                                                                                            |
| `timeoutMs`                      | Deadline for the whole invocation, including setup; default `600000` (10 minutes).                                                |
| `cleanupTimeoutMs`               | Separate deadline for stopping the session and archiving owned resources; default `10000`.                                        |
| `retainSession`                  | Keep a successful session and any definitions created for it for inspection; default `false`. Failed calls still attempt cleanup. |

## Results and lifecycle

Each call sends the rendered prompt as one text user message in a fresh session. Sessions are isolated across concurrent tests, and hosted responses are not cached. The provider returns the last main-agent text message as `output` and includes `sessionId`, `agentId`, `environmentId`, `workflowRuns`, and primary-thread `toolCalls` in response metadata. A workflow's child messages and tool calls stay in its own hosted thread and are not included in `toolCalls`.

Usage comes from the session totals, including workflow threads. Prompt-token totals include uncached input, cache reads, and cache creation. `cost` is the session's reported USD list cost, including hosted runtime, converted from cents. Anthropic rounds list cost to the nearest cent, so a session that costs less than half a cent reports `0`. If the final usage read fails, the completed answer is preserved, `metadata.usageError` records the failure, and any streamed usage snapshot is used instead. Missing cost is left unknown.

Promptfoo archives its session when finished, then archives any agent or environment it created. Existing agent and environment definitions are left intact. Failed, timed-out, and cancelled calls first request an interrupt. Anthropic accepts archival only after a session stops running, and an interrupted session keeps running until its current step, such as an in-flight tool call, finishes. Promptfoo waits for the session to stop, up to `cleanupTimeoutMs`, and then archives it. Raise `cleanupTimeoutMs` for agents that make long tool calls.

[Interrupts do not end dynamic workflow runs](https://platform.claude.com/docs/en/managed-agents/workflow-runs#interrupt-a-session-with-runs-open), and an open run can prevent archival. If cleanup fails, the eval reports an error and preserves resource IDs in `metadata.cleanupErrors` and the corresponding ID fields; inspect that session in the Anthropic Console to stop the run and archive it. Promptfoo does not raise a session's budget to resume or stop its runs.

Interrupted, failed, budget-limited, and truncated runs are reported as errors. So is a workflow start that Anthropic refuses; `metadata.workflowStartErrors` records the reason. API failures include Anthropic's error type and message. Requests that start or steer a hosted run are not automatically retried, because repeating them can duplicate tool side effects. The final usage read and archival can be retried.

This provider supports server-executed tools in cloud environments. Custom tools requiring client execution, permission confirmations, and self-hosted tool execution are not supported. A request for client action returns an error; Promptfoo does not grant tool permissions automatically.

Try the [complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-managed-agents), which verifies both the answer and a completed workflow run.
