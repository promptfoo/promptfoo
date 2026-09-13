---
title: 'Interface: AssertionTokenUsage'
description: 'Token accounting attributed to model-graded assertions. See supported promptfoo Node.js imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 4
---

## Import

```ts
import type { AssertionTokenUsage } from 'promptfoo';
```

Defined in: [src/contracts/shared.ts:74](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L74)

Token accounting attributed to model-graded assertions.

## Properties

### cached?

> `optional` **cached?**: `number`

Defined in: [src/contracts/shared.ts:48](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L48)

---

### completion?

> `optional` **completion?**: `number`

Defined in: [src/contracts/shared.ts:47](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L47)

---

### completionDetails?

> `optional` **completionDetails?**: `object`

Defined in: [src/contracts/shared.ts:51](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L51)

#### acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Prediction tokens accepted by speculative decoding, when reported.

#### cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Input tokens written into a provider cache.

#### cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Input tokens read from a provider cache.

#### reasoning?

> `optional` **reasoning?**: `number`

Tokens spent on hidden model reasoning when the provider reports them.

#### rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Prediction tokens rejected by speculative decoding, when reported.

---

### numRequests?

> `optional` **numRequests?**: `number`

Defined in: [src/contracts/shared.ts:50](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L50)

---

### prompt?

> `optional` **prompt?**: `number`

Defined in: [src/contracts/shared.ts:46](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L46)

---

### total?

> `optional` **total?**: `number`

Defined in: [src/contracts/shared.ts:49](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L49)
