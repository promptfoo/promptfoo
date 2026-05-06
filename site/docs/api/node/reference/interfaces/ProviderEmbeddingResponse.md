---
title: 'Interface: ProviderEmbeddingResponse'
description: 'Response returned by embedding-capable providers.'
---

## Import

```ts
import type { ProviderEmbeddingResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:615](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L615)

Response returned by embedding-capable providers.

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

Defined in: [types/providers.ts:617](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L617)

Whether the embedding response came from cache.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:619](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L619)

Estimated request cost when the provider can report it.

---

### embedding?

> `optional` **embedding?**: `number`[]

Defined in: [types/providers.ts:623](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L623)

Embedding vector returned by the provider.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:621](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L621)

Error message when the embedding call failed without throwing.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:625](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L625)

End-to-end provider latency in milliseconds.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:629](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L629)

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

Defined in: [types/providers.ts:627](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L627)

Token usage attributed to the embedding request.
