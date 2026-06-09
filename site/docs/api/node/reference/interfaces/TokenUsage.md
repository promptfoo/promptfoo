---
title: 'Interface: TokenUsage'
description: 'Token accounting reported by providers and graders.'
sidebar_position: 46
---

## Import

```ts
import type { TokenUsage } from 'promptfoo';
```

Defined in: [contracts/shared.ts:125](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L125)

Token accounting reported by providers and graders.

## Example

```ts
const usage: TokenUsage = {
  prompt: 12,
  completion: 8,
  total: 20,
};
```

## Properties

### assertions?

> `optional` **assertions?**: [`AssertionTokenUsage`](AssertionTokenUsage.md)

Defined in: [contracts/shared.ts:139](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L139)

Token usage accumulated by model-graded assertions.

---

### cached?

> `optional` **cached?**: `number`

Defined in: [contracts/shared.ts:131](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L131)

Tokens served from a provider cache, when reported.

---

### completion?

> `optional` **completion?**: `number`

Defined in: [contracts/shared.ts:129](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L129)

Completion/output tokens produced by the provider call.

---

### completionDetails?

> `optional` **completionDetails?**: [`CompletionTokenDetails`](CompletionTokenDetails.md)

Defined in: [contracts/shared.ts:137](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L137)

Provider-specific completion-token breakdown.

---

### numRequests?

> `optional` **numRequests?**: `number`

Defined in: [contracts/shared.ts:135](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L135)

Number of underlying requests represented by this usage object.

---

### prompt?

> `optional` **prompt?**: `number`

Defined in: [contracts/shared.ts:127](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L127)

Prompt/input tokens consumed by the provider call.

---

### total?

> `optional` **total?**: `number`

Defined in: [contracts/shared.ts:133](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/shared.ts#L133)

Total tokens reported for the provider call.
