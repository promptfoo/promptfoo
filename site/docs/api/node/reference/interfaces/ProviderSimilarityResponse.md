---
title: 'Interface: ProviderSimilarityResponse'
description: 'Response returned by similarity-capable providers.'
---

## Import

```ts
import type { ProviderSimilarityResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:681](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L681)

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

Defined in: [types/providers.ts:683](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L683)

Error message when the similarity call failed without throwing.

---

### similarity?

> `optional` **similarity?**: `number`

Defined in: [types/providers.ts:685](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L685)

Similarity score reported by the provider.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [types/providers.ts:687](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L687)

Token usage attributed to the similarity request.
