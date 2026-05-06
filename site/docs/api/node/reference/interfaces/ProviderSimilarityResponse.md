[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderSimilarityResponse

# Interface: ProviderSimilarityResponse

Defined in: [types/providers.ts:618](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L618)

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

Defined in: [types/providers.ts:620](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L620)

Error message when the similarity call failed without throwing.

---

### similarity?

> `optional` **similarity?**: `number`

Defined in: [types/providers.ts:622](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L622)

Similarity score reported by the provider.

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<[`TokenUsage`](TokenUsage.md)\>

Defined in: [types/providers.ts:624](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L624)

Token usage attributed to the similarity request.
