[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderClassificationResponse

# Interface: ProviderClassificationResponse

Defined in: [types/providers.ts:639](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L639)

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

Defined in: [types/providers.ts:643](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L643)

Class labels mapped to provider-reported scores.

---

### error?

> `optional` **error?**: `string`

Defined in: [types/providers.ts:641](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L641)

Error message when the classification call failed without throwing.
