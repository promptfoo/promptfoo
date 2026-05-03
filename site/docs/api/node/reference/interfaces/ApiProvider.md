[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ApiProvider

# Interface: ApiProvider

Defined in: [types/providers.ts:167](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L167)

Provider object shape accepted by the Node.js API.

## Properties

### callApi

> **callApi**: [`CallApiFunction`](CallApiFunction.md)

Defined in: [types/providers.ts:171](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L171)

Execute one provider request.

---

### callClassificationApi?

> `optional` **callClassificationApi?**: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>

Defined in: [types/providers.ts:173](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L173)

Optional classification-specific entrypoint for compatible providers.

#### Parameters

##### prompt

`string`

#### Returns

`Promise`\<`ProviderClassificationResponse`\>

---

### callEmbeddingApi?

> `optional` **callEmbeddingApi?**: (`input`) => `Promise`\<`ProviderEmbeddingResponse`\>

Defined in: [types/providers.ts:175](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L175)

Optional embedding-specific entrypoint for compatible providers.

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`ProviderEmbeddingResponse`\>

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:195](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L195)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:177](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L177)

Provider-specific configuration retained for later calls and serialization.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:179](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L179)

Delay in milliseconds before provider calls.

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:181](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L181)

Optional stable session id for conversational providers.

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:169](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L169)

Stable id used in result tables, cache keys, and provider lookups.

#### Returns

`string`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:183](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L183)

Named provider inputs used by multi-input targets.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:185](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L185)

Human-readable label shown in reports.

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:189](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L189)

Custom JSON serialization hook for persisted eval records.

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:187](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L187)

Transform provider output before assertions run.
