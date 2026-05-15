---
title: 'Interface: CallApiFunction()'
description: 'Function signature used by custom providers.'
---

## Import

```ts
import type { CallApiFunction } from 'promptfoo';
```

Defined in: [types/providers.ts:736](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L736)

Function signature used by custom providers.

Return a `ProviderResponse` with at least `output` or `error`. The optional
`context` argument exposes the rendered prompt, variables, logger, and eval
metadata for the current call. Use `options.abortSignal` for request-scoped
cancellation when your provider supports it.

## Example

```ts
const echoProvider: CallApiFunction = async (prompt, context) => ({
  output: `Echo: ${prompt}`,
  metadata: { user: context?.vars.user },
});
```

> **CallApiFunction**(`prompt`, `context?`, `options?`): `Promise`\<[`ProviderResponse`](ProviderResponse.md)\>

Defined in: [types/providers.ts:737](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L737)

Function signature used by custom providers.

Return a `ProviderResponse` with at least `output` or `error`. The optional
`context` argument exposes the rendered prompt, variables, logger, and eval
metadata for the current call. Use `options.abortSignal` for request-scoped
cancellation when your provider supports it.

## Parameters

### prompt

`string`

Rendered prompt text for the current provider call.

### context?

[`CallApiContextParams`](CallApiContextParams.md)

Runtime metadata for the current eval row, when available.

### options?

[`CallApiOptionsParams`](CallApiOptionsParams.md)

Per-request execution options such as cancellation.

## Returns

`Promise`\<[`ProviderResponse`](ProviderResponse.md)\>

## Example

```ts
const echoProvider: CallApiFunction = async (prompt, context) => ({
  output: `Echo: ${prompt}`,
  metadata: { user: context?.vars.user },
});
```

## Properties

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:743](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L743)

Human-readable label used when the provider function is shown in reports.
