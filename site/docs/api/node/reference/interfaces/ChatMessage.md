---
title: 'Interface: ChatMessage'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 12
---

## Import

```ts
import type { ChatMessage } from 'promptfoo';
```

Defined in: [src/contracts/providers.ts:17](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L17)

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

Defined in: [src/contracts/providers.ts:21](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L21)

Text content sent or received for the turn.

---

### role

> **role**: `"function"` \| `"system"` \| `"user"` \| `"assistant"` \| `"tool"`

Defined in: [src/contracts/providers.ts:19](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L19)

Speaker role for the message.
