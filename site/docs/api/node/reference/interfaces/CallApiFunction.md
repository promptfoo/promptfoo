[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiFunction

# Interface: CallApiFunction()

Defined in: [types/providers.ts:435](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L435)

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

Defined in: [types/providers.ts:436](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L436)

Function signature used by custom providers.

Return a `ProviderResponse` with at least `output` or `error`. The optional
`context` argument exposes the rendered prompt, variables, logger, and eval
metadata for the current call. Use `options.abortSignal` for request-scoped
cancellation when your provider supports it.

## Parameters

### prompt

`string`

### context?

[`CallApiContextParams`](CallApiContextParams.md)

### options?

[`CallApiOptionsParams`](CallApiOptionsParams.md)

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

Defined in: [types/providers.ts:442](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L442)

Human-readable label used when the provider function is shown in reports.
