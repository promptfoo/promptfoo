---
title: 'Interface: ChatMessage'
---

Defined in: [types/providers.ts:78](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L78)

Chat message reported by providers for multi-turn prompts and transcripts.

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

Defined in: [types/providers.ts:82](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L82)

Text content sent or received for the turn.

---

### role

> **role**: `"function"` \| `"system"` \| `"user"` \| `"assistant"` \| `"tool"`

Defined in: [types/providers.ts:80](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L80)

Speaker role for the message.
