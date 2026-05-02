[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ApiProvider

# Interface: ApiProvider

Defined in: [types/providers.ts:118](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L118)

## Extended by

- [`ApiEmbeddingProvider`](ApiEmbeddingProvider.md)
- [`ApiSimilarityProvider`](ApiSimilarityProvider.md)
- [`ApiClassificationProvider`](ApiClassificationProvider.md)
- [`ApiModerationProvider`](ApiModerationProvider.md)

## Properties

### callApi

> **callApi**: [`CallApiFunction`](../type-aliases/CallApiFunction.md)

Defined in: [types/providers.ts:120](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L120)

---

### callClassificationApi?

> `optional` **callClassificationApi?**: (`prompt`) => `Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>

Defined in: [types/providers.ts:121](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L121)

#### Parameters

##### prompt

`string`

#### Returns

`Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>

---

### callEmbeddingApi?

> `optional` **callEmbeddingApi?**: (`input`) => `Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

Defined in: [types/providers.ts:122](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L122)

#### Parameters

##### input

`string`

#### Returns

`Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:135](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L135)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:123](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L123)

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:124](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L124)

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:125](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L125)

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:119](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L119)

#### Returns

`string`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:126](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L126)

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:127](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L127)

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:129](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L129)

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:128](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L128)
