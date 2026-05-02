[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderEmbeddingResponse

# Interface: ProviderEmbeddingResponse

Defined in: [types/providers.ts:265](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L265)

## Properties

### cached?

> `optional` **cached?**: `boolean`

Defined in: [types/providers.ts:266](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L266)

---

### cost?

> `optional` **cost?**: `number`

Defined in: [types/providers.ts:267](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L267)

---

### embedding?

> `optional` **embedding?**: `number`[]

Defined in: [types/providers.ts:269](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L269)

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:268](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L268)

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [types/providers.ts:270](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L270)

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [types/providers.ts:272](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L272)

#### Index Signature

\[`key`: `string`\]: `any`

#### originalText?

> `optional` **originalText?**: `string`

#### transformed?

> `optional` **transformed?**: `boolean`

---

### tokenUsage?

> `optional` **tokenUsage?**: `Partial`\<\{ `assertions?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}\>

Defined in: [types/providers.ts:271](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/providers.ts#L271)
