[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderEmbeddingResponse

# Interface: ProviderEmbeddingResponse

Defined in: [types/providers.ts:583](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L583)

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

Defined in: [types/providers.ts:585](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L585)

Whether the embedding response came from cache.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:587](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L587)

Estimated request cost when the provider can report it.

---

### embedding?

> `optional` **embedding?**: `number`[]

Defined in: [types/providers.ts:591](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L591)

Embedding vector returned by the provider.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:589](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L589)

Error message when the embedding call failed without throwing.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:593](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L593)

End-to-end provider latency in milliseconds.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:597](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L597)

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

Defined in: [types/providers.ts:595](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L595)

Token usage attributed to the embedding request.
