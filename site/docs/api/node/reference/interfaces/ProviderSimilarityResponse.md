---
title: 'Interface: ProviderSimilarityResponse'
---

Defined in: [types/providers.ts:628](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L628)

Response returned by similarity-capable providers.

## Example

```ts
const response: ProviderSimilarityResponse = {
  similarity: 0.93,
};
```

## Properties

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:630](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L630)

Error message when the similarity call failed without throwing.

---

### similarity?

> `optional` **similarity?**: `number`

Defined in: [types/providers.ts:632](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L632)

Similarity score reported by the provider.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [types/providers.ts:634](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L634)

Token usage attributed to the similarity request.
