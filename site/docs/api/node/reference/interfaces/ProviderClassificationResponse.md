---
title: 'Interface: ProviderClassificationResponse'
---

Defined in: [types/providers.ts:649](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L649)

Response returned by classification-capable providers.

## Example

```ts
const response: ProviderClassificationResponse = {
  classification: { positive: 0.91, negative: 0.09 },
};
```

## Properties

### classification?

> `optional` **classification?**: `Record`\<`string`, `number`\>

Defined in: [types/providers.ts:653](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L653)

Class labels mapped to provider-reported scores.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:651](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L651)

Error message when the classification call failed without throwing.
