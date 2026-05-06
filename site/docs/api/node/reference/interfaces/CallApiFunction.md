[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiFunction

# Interface: CallApiFunction()

Defined in: [types/providers.ts:576](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L576)

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

Defined in: [types/providers.ts:577](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L577)

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

Defined in: [types/providers.ts:583](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L583)

Human-readable label used when the provider function is shown in reports.
