---
sidebar_label: Multi-Turn Session Management
description: Red team multi-turn conversation attacks by exploiting session management vulnerabilities to protect AI systems from context manipulation and unauthorized state access
---

# Session Management

Session management is important for [multi-turn strategies](/docs/red-team/strategies/multi-turn) like Crescendo, GOAT, and [Hydra](/docs/red-team/strategies/hydra). In these cases you want to make sure that the target system is able to maintain context between turns.

Use the default replay mode when the target expects the full conversation transcript in every request. Use `stateful: true` only when the target provider stores prior turns and expects just the newest message on each request.

For HTTP and WebSocket targets, there are two common ways sessions can be managed:

1. Client Side Session
2. Server Side Session

#### Client Side Session Management

If you are using a Promptfoo provider like HTTP or WebSocket, Promptfoo has a built-in function to generate a unique UUID for each test case. The UUID can then be used to maintain context between turns.

Follow the instructions in the [Client Side Session Management](/docs/providers/http/#client-side-session-management) docs.

#### Server Side Session Management

Promptfoo provides tools to extract the Session ID from the response and pass it to the next turn.

Follow the instructions in the [Server Side Session Management](/docs/providers/http/#server-side-session-management) docs.

#### OpenAI Agents SDK Sessions

If you are using the built-in JavaScript [`openai:agents:*` provider](/docs/providers/openai-agents), use the [stateful red-team session pattern](/docs/providers/openai-agents/#stateful-red-team-runs) instead of the HTTP-specific patterns above.
