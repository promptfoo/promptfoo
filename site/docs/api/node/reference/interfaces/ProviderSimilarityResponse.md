---
title: 'Interface: ProviderSimilarityResponse'
description: 'Response returned by similarity-capable providers. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 37
---

## Import

```ts
import type { ProviderSimilarityResponse } from 'promptfoo';
```

Defined in: [src/contracts/providers.ts:318](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L318)

Response returned by similarity-capable providers.

## Properties

### error?

> `optional` **error?**: `string`

Defined in: [src/contracts/providers.ts:320](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L320)

Error message when the similarity call failed without throwing.

---

### similarity?

> `optional` **similarity?**: `number`

Defined in: [src/contracts/providers.ts:322](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L322)

Similarity score reported by the provider.

---

### tokenUsage?

<!-- prettier-ignore -->
> `optional` **tokenUsage?**: `Partial`\<\{ `assertions?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `attacker?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `generation?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `incurredTokenUsage?`: \{ `assertions?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `attacker?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `generation?`: \{ `cached?`: `number`; `completion?`: `number`; `completionDetails?`: \{ `acceptedPrediction?`: `number`; `cacheCreationInputTokens?`: `number`; `cacheReadInputTokens?`: `number`; `reasoning?`: `number`; `rejectedPrediction?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}; `numRequests?`: `number`; `prompt?`: `number`; `total?`: `number`; \}\>

Defined in: [src/contracts/providers.ts:324](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L324)

Token usage attributed to the similarity request.
