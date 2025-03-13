---
sidebar_label: Multi-Turn Session Management
---

# Session Management

Session management is important for our multi-turn strategies like Crescendo and GOAT. In these cases you want to make sure that the target system is able to maintain context between turns.

There are two ways sessions can be generated:

1. Client Side Session
2. Server Side Session

#### Client Side Session Management

If you are using a Promptfoo provider like HTTP or WebSocket,Promptfoo has a built in function to generate a unique UUID for each test case. The UUID can then be used to maintain context between turns.

Follow the instructions in the [Client Side Session Management](/docs/providers/http/#client-side-session-management) docs.

#### Server Side Session Management

Promptfoo provides tools to extract the Session ID from the response and pass it to the next turn.

Follow the instructions in the [Server Side Session Management](/docs/providers/http/#server-side-session-management) docs.
