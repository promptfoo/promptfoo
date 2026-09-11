---
title: 'Interface: GuardrailResponse'
description: 'Guardrail outcome metadata returned by moderation-aware providers. See supported imports, signatures, fields, examples, and usage details for this symbol.'
sidebar_position: 22
---

## Import

```ts
import type { GuardrailResponse } from 'promptfoo';
```

Defined in: contracts/providers.ts:51

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

Defined in: contracts/providers.ts:57

Aggregate flag when the provider does not distinguish input from output.

---

### flaggedInput?

> `optional` **flaggedInput?**: `boolean`

Defined in: contracts/providers.ts:53

Whether the input prompt tripped a guardrail.

---

### flaggedOutput?

> `optional` **flaggedOutput?**: `boolean`

Defined in: contracts/providers.ts:55

Whether the provider output tripped a guardrail.

---

### reason?

> `optional` **reason?**: `string`

Defined in: contracts/providers.ts:59

Provider-supplied reason for the guardrail outcome.
