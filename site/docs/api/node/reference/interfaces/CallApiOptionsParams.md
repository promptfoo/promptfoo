---
title: 'Interface: CallApiOptionsParams'
description: 'Per-request options passed to custom providers. See the supported promptfoo Node.js API imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 11
---

## Import

```ts
import type { CallApiOptionsParams } from 'promptfoo';
```

Defined in: [src/types/providers.ts:256](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L256)

Per-request options passed to custom providers.

These are execution controls for one call, not provider configuration. Read
them inside `callApi()` when the transport can honor cancellation or optional
log-prob requests.

## Example

```ts
const provider: ProviderFunction = async (prompt, _context, options) => {
  const response = await fetch('https://example.com/llm', {
    method: 'POST',
    body: prompt,
    signal: options?.abortSignal,
  });
  return { output: await response.text() };
};
```

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [src/types/providers.ts:260](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L260)

Signal that can be used to abort the request.

---

### includeLogProbs?

> `optional` **includeLogProbs?**: `boolean`

Defined in: [src/types/providers.ts:258](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L258)

Whether the caller requested token log probabilities when supported.
