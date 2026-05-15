---
title: 'Interface: ChatMessage'
description: 'Chat message reported by providers for multi-turn prompts and transcripts.'
---

## Import

```ts
import type { ChatMessage } from 'promptfoo';
```

Defined in: [types/providers.ts:90](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L90)

Chat message reported by providers for multi-turn prompts and transcripts.

Providers use this lightweight shape when they need to preserve the exact
conversation that was sent to or returned from a chat-capable model.

## Example

```ts
const message: ChatMessage = {
  role: 'user',
  content: 'Summarize this article.',
};
```

## Properties

### content

> **content**: `string`

Defined in: [types/providers.ts:94](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L94)

Text content sent or received for the turn.

---

### role

> **role**: `"function"` \| `"system"` \| `"user"` \| `"assistant"` \| `"tool"`

Defined in: [types/providers.ts:92](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L92)

Speaker role for the message.
