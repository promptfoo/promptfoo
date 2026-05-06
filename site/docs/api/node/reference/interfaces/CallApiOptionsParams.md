[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiOptionsParams

# Interface: CallApiOptionsParams

Defined in: [types/providers.ts:213](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L213)

Per-request options passed to custom providers.

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

Defined in: [types/providers.ts:217](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L217)

Signal that can be used to abort the request.

---

### includeLogProbs?

> `optional` **includeLogProbs?**: `boolean`

Defined in: [types/providers.ts:215](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L215)

Whether the caller requested token log probabilities when supported.
