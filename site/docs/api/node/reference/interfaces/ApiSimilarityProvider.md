[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ApiSimilarityProvider

# Interface: ApiSimilarityProvider

Defined in: [types/providers.ts:142](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L142)

## Extends

- [`ApiProvider`](ApiProvider.md)

## Properties

### callApi

> **callApi**: [`CallApiFunction`](../type-aliases/CallApiFunction.md)

Defined in: [types/providers.ts:120](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L120)

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`callApi`](ApiProvider.md#callapi)

---

### callClassificationApi?

> `optional` **callClassificationApi?**: (`prompt`) => `Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>

Defined in: [types/providers.ts:121](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L121)

#### Parameters

##### prompt

`string`

#### Returns

`Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`callClassificationApi`](ApiProvider.md#callclassificationapi)

---

### callEmbeddingApi?

> `optional` **callEmbeddingApi?**: (`input`) => `Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

Defined in: [types/providers.ts:122](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L122)

#### Parameters

##### input

`string`

#### Returns

`Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`callEmbeddingApi`](ApiProvider.md#callembeddingapi)

---

### callSimilarityApi

> **callSimilarityApi**: (`reference`, `input`) => `Promise`\<[`ProviderSimilarityResponse`](ProviderSimilarityResponse.md)\>

Defined in: [types/providers.ts:143](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L143)

#### Parameters

##### reference

`string`

##### input

`string`

#### Returns

`Promise`\<[`ProviderSimilarityResponse`](ProviderSimilarityResponse.md)\>

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:135](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L135)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`cleanup`](ApiProvider.md#cleanup)

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:123](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L123)

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`config`](ApiProvider.md#config)

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:124](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L124)

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`delay`](ApiProvider.md#delay)

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:125](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L125)

#### Returns

`string`

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`getSessionId`](ApiProvider.md#getsessionid)

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:119](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L119)

#### Returns

`string`

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`id`](ApiProvider.md#id)

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:126](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L126)

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`inputs`](ApiProvider.md#inputs)

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:127](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L127)

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`label`](ApiProvider.md#label)

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:129](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L129)

#### Returns

`any`

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`toJSON`](ApiProvider.md#tojson)

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:128](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L128)

#### Inherited from

[`ApiProvider`](ApiProvider.md).[`transform`](ApiProvider.md#transform)
