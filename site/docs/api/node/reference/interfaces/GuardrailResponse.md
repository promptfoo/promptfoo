---
title: 'Interface: GuardrailResponse'
description: 'Guardrail outcome metadata returned by moderation-aware providers.'
sidebar_position: 24
---

## Import

```ts
import type { GuardrailResponse } from 'promptfoo';
```

Defined in: [contracts/providers.ts:50](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L50)

Guardrail outcome metadata returned by moderation-aware providers.

## Example

```ts
const guardrails: GuardrailResponse = {
  flaggedInput: false,
  flaggedOutput: true,
  reason: 'Detected disallowed content',
};
```

## Properties

### flagged?

> `optional` **flagged?**: `boolean`

Defined in: [contracts/providers.ts:56](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L56)

Aggregate flag when the provider does not distinguish input from output.

---

### flaggedInput?

> `optional` **flaggedInput?**: `boolean`

Defined in: [contracts/providers.ts:52](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L52)

Whether the input prompt tripped a guardrail.

---

### flaggedOutput?

> `optional` **flaggedOutput?**: `boolean`

Defined in: [contracts/providers.ts:54](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L54)

Whether the provider output tripped a guardrail.

---

### reason?

> `optional` **reason?**: `string`

Defined in: [contracts/providers.ts:58](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/providers.ts#L58)

Provider-supplied reason for the guardrail outcome.
