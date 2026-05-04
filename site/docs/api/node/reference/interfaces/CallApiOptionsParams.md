[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiOptionsParams

# Interface: CallApiOptionsParams

Defined in: [types/providers.ts:156](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L156)

Per-request options passed to custom providers.

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [types/providers.ts:160](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L160)

Signal that can be used to abort the request.

---

### includeLogProbs?

> `optional` **includeLogProbs?**: `boolean`

Defined in: [types/providers.ts:158](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L158)

Whether the caller requested token log probabilities when supported.
