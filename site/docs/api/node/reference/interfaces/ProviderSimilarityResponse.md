---
title: 'Interface: ProviderSimilarityResponse'
description: 'Response returned by similarity-capable providers.'
---

## Import

```ts
import type { ProviderSimilarityResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:680](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L680)

Response returned by similarity-capable providers.

This is the payload returned from `callSimilarityApi()` when assertions or
custom code ask a provider to compare two strings.

## Example

```ts
const response: ProviderSimilarityResponse = {
  similarity: 0.93,
};
```

## Properties

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:682](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L682)

Error message when the similarity call failed without throwing.

---

### similarity?

> `optional` **similarity?**: `number`

Defined in: [types/providers.ts:684](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L684)

Similarity score reported by the provider.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [types/providers.ts:686](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L686)

Token usage attributed to the similarity request.
