---
title: 'Interface: CompletionTokenDetails'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 14
---

## Import

```ts
import type { CompletionTokenDetails } from 'promptfoo';
```

Defined in: contracts/shared.ts:43

Detailed completion-token breakdown reported by reasoning-capable models.

## Example

```ts
const details: CompletionTokenDetails = {
  reasoning: 32,
  cacheReadInputTokens: 128,
};
```

## Properties

### acceptedPrediction?

> `optional` **acceptedPrediction?**: `number`

Defined in: contracts/shared.ts:20

Prediction tokens accepted by speculative decoding, when reported.

---

### cacheCreationInputTokens?

> `optional` **cacheCreationInputTokens?**: `number`

Defined in: contracts/shared.ts:26

Input tokens written into a provider cache.

---

### cacheReadInputTokens?

> `optional` **cacheReadInputTokens?**: `number`

Defined in: contracts/shared.ts:24

Input tokens read from a provider cache.

---

### reasoning?

> `optional` **reasoning?**: `number`

Defined in: contracts/shared.ts:18

Tokens spent on hidden model reasoning when the provider reports them.

---

### rejectedPrediction?

> `optional` **rejectedPrediction?**: `number`

Defined in: contracts/shared.ts:22

Prediction tokens rejected by speculative decoding, when reported.
