---
title: 'Interface: ProviderEmbeddingResponse'
description: 'Response returned by embedding-capable providers. See the supported promptfoo Node.js API imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 34
---

## Import

```ts
import type { ProviderEmbeddingResponse } from 'promptfoo';
```

Defined in: [src/contracts/providers.ts:294](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L294)

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

Defined in: [src/contracts/providers.ts:296](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L296)

Whether the embedding response came from cache.

---

### cost?

> `optional` **cost?**: `number`

Defined in: [src/contracts/providers.ts:298](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L298)

Estimated request cost when the provider can report it.

---

### embedding?

> `optional` **embedding?**: `number`[]

Defined in: [src/contracts/providers.ts:302](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L302)

Embedding vector returned by the provider.

---

### error?

> `optional` **error?**: `string`

Defined in: [src/contracts/providers.ts:300](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L300)

Error message when the embedding call failed without throwing.

---

### latencyMs?

> `optional` **latencyMs?**: `number`

Defined in: [src/contracts/providers.ts:304](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L304)

End-to-end provider latency in milliseconds.

---

### metadata?

> `optional` **metadata?**: `object`

Defined in: [src/contracts/providers.ts:308](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L308)

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

<!-- prettier-ignore -->
> `optional` **tokenUsage?**: `Partial`\<\{ `assertions?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `attacker?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `generation?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `incurredTokenUsage?`: \{ `assertions?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `attacker?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `generation?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}\>

Defined in: [src/contracts/providers.ts:306](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L306)

Token usage attributed to the embedding request.
