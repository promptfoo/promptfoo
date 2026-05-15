---
title: 'Interface: CallApiOptionsParams'
description: 'Per-request options passed to custom providers.'
---

## Import

```ts
import type { CallApiOptionsParams } from 'promptfoo';
```

Defined in: [types/providers.ts:266](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L266)

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

Defined in: [types/providers.ts:270](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L270)

Signal that can be used to abort the request.

---

### includeLogProbs?

> `optional` **includeLogProbs?**: `boolean`

Defined in: [types/providers.ts:268](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L268)

Whether the caller requested token log probabilities when supported.
