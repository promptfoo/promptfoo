---
title: 'Interface: ProviderEmbeddingResponse'
description: 'Response returned by embedding-capable providers.'
---

## Import

```ts
import type { ProviderEmbeddingResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:643](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L643)

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

Defined in: [types/providers.ts:645](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L645)

Whether the embedding response came from cache.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:647](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L647)

Estimated request cost when the provider can report it.

---

### embedding?

> `optional` **embedding?**: `number`[]

Defined in: [types/providers.ts:651](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L651)

Embedding vector returned by the provider.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:649](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L649)

Error message when the embedding call failed without throwing.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:653](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L653)

End-to-end provider latency in milliseconds.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:657](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L657)

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

Defined in: [types/providers.ts:655](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L655)

Token usage attributed to the embedding request.
