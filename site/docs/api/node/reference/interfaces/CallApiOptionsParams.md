[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / CallApiOptionsParams

# Interface: CallApiOptionsParams

Defined in: [types/providers.ts:169](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L169)

Per-request options passed to custom providers.

## Properties

### abortSignal?

> `optional` **abortSignal?**: `AbortSignal`

Defined in: [types/providers.ts:173](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L173)

Signal that can be used to abort the request.

---

### includeLogProbs?

> `optional` **includeLogProbs?**: `boolean`

Defined in: [types/providers.ts:171](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L171)

Whether the caller requested token log probabilities when supported.
