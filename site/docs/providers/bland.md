---
title: Bland Provider
sidebar_label: Bland
description: Evaluate and red team Bland voice agents and conversational pathways in text, turn by turn, through Bland's pathway chat API, with multi-turn sessions.
sidebar_position: 42
keywords: [bland, voice agents, phone agents, conversational pathways, red teaming, multi-turn]
---

# Bland

The Bland provider tests [Bland](https://www.bland.ai) voice agents without placing phone calls. It drives an agent or a conversational pathway through Bland's [pathway chat API](https://docs.bland.ai/api-v1/post/pathway-chat-create), which runs the same graph a call would, one text turn at a time. Each response carries the agent's reply plus the node it reached and the variables it extracted, so you can assert on what the agent said and on what it captured.

## Setup

Create an API key in the [Bland dashboard](https://app.bland.ai) and set it:

```sh
export BLAND_API_KEY=your_api_key
```

## Targets

| Provider ID                  | Chats with                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- |
| `bland:agent:<agent_id>`     | A Bland agent. `agentVersion` picks the environment or version.            |
| `bland:pathway:<pathway_id>` | A conversational pathway. `pathwayVersion` and `startNodeId` are optional. |

```yaml
providers:
  - id: bland:agent:YOUR_AGENT_ID
    config:
      agentVersion: staging
      requestData:
        from: '+15555550100'
        patient_name: '{{patient_name}}'
```

## Configuration

| Option              | Description                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`            | Bland API key. Defaults to `BLAND_API_KEY`.                                                                                                         |
| `apiBaseUrl`        | API base URL. Defaults to `https://api.bland.ai`.                                                                                                   |
| `agentVersion`      | Agents only: `production`, `staging`, `dev`, `latest`, a semver, or `branch:<name>`. Bland uses the production pin when unset.                      |
| `pathwayVersion`    | Pathways only: the pathway version number. Bland uses the production version when unset.                                                            |
| `startNodeId`       | Pathways only: start from this node instead of the start node.                                                                                      |
| `useCandidateModel` | Run the chat on Bland's candidate model.                                                                                                            |
| `requestData`       | Variables the conversation starts with, available in the agent as `{{name}}`. String values are rendered with the test's vars.                      |
| `includeGreeting`   | Ask for the agent's opening message before the first user turn. Defaults to `true`, since most agents greet first and expect the caller to respond. |
| `timeout`           | Request timeout in milliseconds.                                                                                                                    |

## Output

`output` is the agent's reply to the last user turn (several messages from one turn are joined with newlines). `metadata.bland` holds:

- `chatId`, `currentNodeId`, `currentNodeName`
- `variables`, the full variable snapshot after the last turn, and `variableChanges` (`added`, `modified`, `removed`) when Bland reports them
- `completed`, whether the agent ended the conversation
- `transcript`, every exchange in order, including the greeting

When the agent ends the conversation, the response also sets `conversationEnded`, which multi-turn red team strategies use to stop probing.

```yaml
tests:
  - vars:
      message: Can I move my appointment to Tuesday?
    assert:
      - type: icontains
        value: tuesday
      - type: javascript
        value: context.providerResponse.metadata.bland.variables.appointment_day === 'Tuesday'
```

## Multi-turn conversations

A chat-formatted prompt runs as one conversation. User messages are sent in order and assistant messages are skipped, because the agent writes its own replies:

```yaml
prompts:
  - id: reschedule-flow
    raw: |
      [
        {"role": "user", "content": "Hi, I need to change my appointment"},
        {"role": "user", "content": "My date of birth is March 3rd, 1990"},
        {"role": "user", "content": "Tuesday afternoon works"}
      ]
```

Every response includes `sessionId` (the Bland chat ID). When a later call passes that `sessionId` in its vars, the provider continues the chat instead of starting a new one, which is how stateful multi-turn red team strategies talk to a Bland agent. Only chats the provider opened in the current run are continued, so a client-side correlation ID in `sessionId` (such as `transformVars: '{ ...vars, sessionId: context.uuid }'`) still starts a fresh chat. Stateless strategies send the whole conversation as a chat-formatted prompt, which works too.

```yaml
redteam:
  purpose: Appointment line for a dental clinic. Must never disclose other patients' information.
  plugins:
    - pii:direct
    - harmful:privacy
  strategies:
    - id: crescendo
      config:
        stateful: true
```

## Things to know

- **Turns have side effects.** Webhook, tool and custom-code steps in the agent run for real, each message is billed, and every chat appears on the agent's Conversations page. Use a synthetic `from` number in `requestData` and point integrations at test systems.
- **Rate limits.** A `429` is retried on the same turn after `Retry-After`. Other errors are returned as the test's `error`, with the partial transcript in metadata. A `422 ROUTE_NO_MATCH_NO_FALLBACK` names the node that had no matching route.
- **No caching.** Each test runs a live conversation, because a response carries a chat ID that stateful callers continue and every turn runs the agent's real tools.
- **Text, not audio.** The chat API exercises the agent's logic and wording, not speech recognition, voice or interruption handling.

## See also

- [Example: provider-bland](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-bland)
- [Bland pathway chat API](https://docs.bland.ai/api-v1/post/pathway-chat)
- [Red team multi-turn strategies](/docs/red-team/strategies/multi-turn/)
