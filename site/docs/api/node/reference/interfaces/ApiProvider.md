[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ApiProvider

# Interface: ApiProvider

Defined in: [types/providers.ts:234](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L234)

Provider object shape accepted by the Node.js API.

## Example

```ts
const provider: ApiProvider = {
  id: () => 'custom:echo',
  label: 'echo',
  callApi: async (prompt) => ({ output: `Echo: ${prompt}` }),
};
```

## Properties

### callApi

> **callApi**: [`CallApiFunction`](CallApiFunction.md)

Defined in: [types/providers.ts:238](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L238)

Execute one provider request.

---

### callClassificationApi?

> `optional` **callClassificationApi?**: (`prompt`) => `Promise`\<`ProviderClassificationResponse`\>

Defined in: [types/providers.ts:240](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L240)

Optional classification-specific entrypoint for compatible providers.

#### Parameters

##### prompt

`string`

#### Returns

`Promise`\<`ProviderClassificationResponse`\>

---

### callEmbeddingApi?

> `optional` **callEmbeddingApi?**: (`input`) => `Promise`\<`ProviderEmbeddingResponse`\>

Defined in: [types/providers.ts:242](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L242)

Optional embedding-specific entrypoint for compatible providers.

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`ProviderEmbeddingResponse`\>

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:272](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L272)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:249](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L249)

Provider-specific configuration retained for later calls and serialization.
The shape mirrors [ProviderOptions.config](ProviderOptions.md#config); consult the documentation
for the specific provider for the supported keys.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:251](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L251)

Delay in milliseconds before provider calls.

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:253](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L253)

Optional stable session id for conversational providers.

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:236](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L236)

Stable id used in result tables, cache keys, and provider lookups.

#### Returns

`string`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:255](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L255)

Named provider inputs used by multi-input targets.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:257](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L257)

Human-readable label shown in reports.

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:266](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L266)

Custom JSON serialization hook used when persisting the provider on an eval
record. Implementations should return a value that is structurally
serializable (no functions or circular references).

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:259](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L259)

Transform provider output before assertions run.
