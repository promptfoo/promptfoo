---
title: 'Interface: ProviderSimilarityResponse'
description: 'Response returned by similarity-capable providers.'
---

## Import

```ts
import type { ProviderSimilarityResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:653](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L653)

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

Defined in: [types/providers.ts:655](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L655)

Error message when the similarity call failed without throwing.

---

### similarity?

> `optional` **similarity?**: `number`

Defined in: [types/providers.ts:657](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L657)

Similarity score reported by the provider.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [types/providers.ts:659](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L659)

Token usage attributed to the similarity request.
