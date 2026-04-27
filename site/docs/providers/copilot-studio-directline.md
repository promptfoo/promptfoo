---
sidebar_label: Microsoft Copilot Studio
description: Test Microsoft Copilot Studio agents through the Bot Framework Direct Line API
---

# Microsoft Copilot Studio Direct Line

The Microsoft Copilot Studio Direct Line provider lets promptfoo test a Copilot Studio agent through the Bot Framework Direct Line API. It uses Direct Line token generation, starts a conversation, sends each prompt as a message activity, and polls for the agent's reply.

## Configuration

Set the provider `id` to `copilot-studio-directline`:

```yaml
providers:
  - id: copilot-studio-directline
    config:
      directLineSecret: '{{env.COPILOT_STUDIO_DIRECT_LINE_SECRET}}'
      baseUrl: https://directline.botframework.com
      locale: en-US
      pollTimeoutMs: 30000
      pollIntervalMs: 750
      replyIdleTimeoutMs: 1000
```

You can also omit `directLineSecret` from the config and set `COPILOT_STUDIO_DIRECT_LINE_SECRET` in the environment.

## Configuration Options

- `directLineSecret` (optional): Direct Line secret from the Copilot Studio web channel. If omitted, promptfoo reads `COPILOT_STUDIO_DIRECT_LINE_SECRET`, then `COPILOT_DIRECT_LINE_SECRET`.
- `baseUrl` (optional): Direct Line endpoint. Defaults to `https://directline.botframework.com`.
- `userId` (optional): User ID sent to Direct Line. If set, it must start with `dl_`. If omitted, promptfoo generates one per conversation.
- `userName` (optional): Display name sent in Direct Line activities.
- `locale` (optional): Locale attached to message activities. Defaults to `en-US`.
- `pollTimeoutMs` (optional): Maximum time to wait for a Copilot Studio response. Defaults to `30000`.
- `pollIntervalMs` (optional): Delay between activity polling requests. Defaults to `750`.
- `replyIdleTimeoutMs` (optional): After the first bot message, continue polling until no additional reply activities arrive for this long. Defaults to `1000`.
- `trustedOrigins` (optional): JSON array of trusted origins included when generating Direct Line tokens.
- `channelData` (optional): JSON object added to each Direct Line message activity.

## Multi-Message Replies

Direct Line does not attach a universal "final answer is complete" marker to every normal message response. Copilot Studio can emit more than one message activity for a single user prompt. Promptfoo therefore keeps polling after the first bot message and returns once the reply has been idle for `replyIdleTimeoutMs`, or immediately when it sees an `endOfConversation` activity.

## Stateful Conversations

Promptfoo reuses Direct Line conversations when a test sets `vars.sessionId`:

```yaml
tests:
  - vars:
      sessionId: shopper-1
    assert:
      - type: contains
        value: shipping
```

If `vars.sessionId` is not set, promptfoo also checks `metadata.conversationId`. Otherwise, it creates a new conversation for the call.

## Example

```yaml
description: Copilot Studio Direct Line eval

prompts:
  - '{{question}}'

providers:
  - id: copilot-studio-directline
    config:
      directLineSecret: '{{env.COPILOT_STUDIO_DIRECT_LINE_SECRET}}'
      userId: dl_promptfoo_eval

tests:
  - vars:
      question: What can you help me with?
    assert:
      - type: not-empty
```
