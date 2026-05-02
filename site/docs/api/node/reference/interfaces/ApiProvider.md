[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ApiProvider

# Interface: ApiProvider

Defined in: [types/providers.ts:138](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L138)

Provider object shape accepted by the Node.js API.

## Properties

### callApi

> **callApi**: `CallApiFunction`

Defined in: [types/providers.ts:140](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L140)

---

### callClassificationApi?

> `optional` **callClassificationApi?**: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>

Defined in: [types/providers.ts:141](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L141)

#### Parameters

##### prompt

`string`

#### Returns

`Promise`\<`ProviderClassificationResponse`\>

---

### callEmbeddingApi?

> `optional` **callEmbeddingApi?**: (`input`) => `Promise`\<`ProviderEmbeddingResponse`\>

Defined in: [types/providers.ts:142](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L142)

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`ProviderEmbeddingResponse`\>

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:155](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L155)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:143](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L143)

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:144](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L144)

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:145](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L145)

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:139](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L139)

#### Returns

`string`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:146](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L146)

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L147)

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:149](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L149)

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:148](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L148)
