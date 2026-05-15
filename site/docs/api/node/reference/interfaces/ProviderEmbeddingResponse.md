---
title: 'Interface: ProviderEmbeddingResponse'
description: 'Response returned by embedding-capable providers.'
---

## Import

```ts
import type { ProviderEmbeddingResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:642](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L642)

Response returned by embedding-capable providers.

This is the payload returned from `callEmbeddingApi()`. Successful responses
normally populate `embedding`; providers may return `error` instead when they
handle a failure without throwing.

## Example

```ts
const response: ProviderEmbeddingResponse = {
  embedding: [0.1, 0.2, 0.3],
  tokenUsage: { total: 4 },
};
```

## Properties

### cached?

> `optional` **cached?**: `boolean`

Defined in: [types/providers.ts:644](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L644)

Whether the embedding response came from cache.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:646](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L646)

Estimated request cost when the provider can report it.

---

### embedding?

> `optional` **embedding?**: `number`[]

Defined in: [types/providers.ts:650](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L650)

Embedding vector returned by the provider.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:648](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L648)

Error message when the embedding call failed without throwing.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:652](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L652)

End-to-end provider latency in milliseconds.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:656](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L656)

Additional embedding-specific metadata preserved for callers.

#### Index Signature

\[`key`: `string`\]: `any`

#### originalText?

> `optional` **originalText?**: `string`

Original text before any provider-level transform.

#### transformed?

> `optional` **transformed?**: `boolean`

Whether a provider-level transform changed the original input text.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [types/providers.ts:654](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L654)

Token usage attributed to the embedding request.
