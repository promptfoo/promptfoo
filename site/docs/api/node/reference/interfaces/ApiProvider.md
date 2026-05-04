[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ApiProvider

# Interface: ApiProvider

Defined in: [types/providers.ts:168](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L168)

Provider object shape accepted by the Node.js API.

## Properties

### callApi

> **callApi**: [`CallApiFunction`](CallApiFunction.md)

Defined in: [types/providers.ts:172](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L172)

Execute one provider request.

---

### callClassificationApi?

> `optional` **callClassificationApi?**: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>

Defined in: [types/providers.ts:174](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L174)

Optional classification-specific entrypoint for compatible providers.

#### Parameters

##### prompt

`string`

#### Returns

`Promise`\<`ProviderClassificationResponse`\>

---

### callEmbeddingApi?

> `optional` **callEmbeddingApi?**: (`input`) => `Promise`\<`ProviderEmbeddingResponse`\>

Defined in: [types/providers.ts:176](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L176)

Optional embedding-specific entrypoint for compatible providers.

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`ProviderEmbeddingResponse`\>

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:196](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L196)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:178](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L178)

Provider-specific configuration retained for later calls and serialization.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:180](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L180)

Delay in milliseconds before provider calls.

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:182](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L182)

Optional stable session id for conversational providers.

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:170](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L170)

Stable id used in result tables, cache keys, and provider lookups.

#### Returns

`string`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:184](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L184)

Named provider inputs used by multi-input targets.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:186](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L186)

Human-readable label shown in reports.

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:190](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L190)

Custom JSON serialization hook for persisted eval records.

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:188](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L188)

Transform provider output before assertions run.
