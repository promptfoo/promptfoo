---
title: 'Interface: GuardrailResponse'
description: 'Guardrail outcome metadata returned by moderation-aware providers.'
---

## Import

```ts
import type { GuardrailResponse } from 'promptfoo';
```

Defined in: [types/providers.ts:359](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L359)

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

Defined in: [types/providers.ts:365](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L365)

Aggregate flag when the provider does not distinguish input from output.

---

### flaggedInput?

> `optional` **flaggedInput?**: `boolean`

Defined in: [types/providers.ts:361](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L361)

Whether the input prompt tripped a guardrail.

---

### flaggedOutput?

> `optional` **flaggedOutput?**: `boolean`

Defined in: [types/providers.ts:363](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L363)

Whether the provider output tripped a guardrail.

---

### reason?

> `optional` **reason?**: `string`

Defined in: [types/providers.ts:367](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L367)

Provider-supplied reason for the guardrail outcome.
