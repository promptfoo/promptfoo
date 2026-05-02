[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / normalizeInputs

# Function: normalizeInputs()

> **normalizeInputs**(`inputs?`): `Record`\<`string`, [`NormalizedInputDefinition`](../type-aliases/NormalizedInputDefinition.md)\> \| `undefined`

Defined in: [types/shared.ts:151](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/shared.ts#L151)

## Parameters

### inputs?

`Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

## Returns

`Record`\<`string`, [`NormalizedInputDefinition`](../type-aliases/NormalizedInputDefinition.md)\> \| `undefined`
