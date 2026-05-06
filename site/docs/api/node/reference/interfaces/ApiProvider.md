---
title: 'Interface: ApiProvider'
---

Defined in: [types/providers.ts:259](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L259)

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

Defined in: [types/providers.ts:263](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L263)

Execute one provider request.

---

### cleanup?

> `optional` **cleanup?**: () => `void` \| `Promise`\<`void`\>

Defined in: [types/providers.ts:307](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L307)

Provider-wide cleanup hook for releasing long-lived resources such as worker
processes, browser sessions, or pooled connections at eval shutdown.
Request-scoped cancellation should be implemented with `abortSignal`.

#### Returns

`void` \| `Promise`\<`void`\>

---

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:284](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L284)

Provider-specific configuration retained for later calls and serialization.
The shape mirrors [ProviderOptions.config](ProviderOptions.md#config); consult the documentation
for the specific provider for the supported keys.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:286](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L286)

Delay in milliseconds before provider calls.

---

### getSessionId?

> `optional` **getSessionId?**: () => `string`

Defined in: [types/providers.ts:288](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L288)

Optional stable session id for conversational providers.

#### Returns

`string`

---

### id

> **id**: () => `string`

Defined in: [types/providers.ts:261](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L261)

Stable id used in result tables, cache keys, and provider lookups.

#### Returns

`string`

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:290](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L290)

Named provider inputs used by multi-input targets.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:292](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L292)

Human-readable label shown in reports.

---

### toJSON?

> `optional` **toJSON?**: () => `any`

Defined in: [types/providers.ts:301](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L301)

Custom JSON serialization hook used when persisting the provider on an eval
record. Implementations should return a value that is structurally
serializable (no functions or circular references).

#### Returns

`any`

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:294](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L294)

Transform provider output before assertions run.

## Methods

### callClassificationApi()?

> `optional` **callClassificationApi**(`prompt`): `Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>

Defined in: [types/providers.ts:270](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L270)

Optional classification-specific entrypoint for compatible providers.

#### Parameters

##### prompt

`string`

Text to classify.

#### Returns

`Promise`\<[`ProviderClassificationResponse`](ProviderClassificationResponse.md)\>

Class labels mapped to provider-reported scores.

---

### callEmbeddingApi()?

> `optional` **callEmbeddingApi**(`input`): `Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

Defined in: [types/providers.ts:277](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L277)

Optional embedding-specific entrypoint for compatible providers.

#### Parameters

##### input

`string`

Text to embed.

#### Returns

`Promise`\<[`ProviderEmbeddingResponse`](ProviderEmbeddingResponse.md)\>

Embedding vector plus any provider-reported metadata.
