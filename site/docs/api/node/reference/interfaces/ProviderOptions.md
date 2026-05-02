[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderOptions

# Interface: ProviderOptions

Defined in: [types/providers.ts:76](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L76)

Declarative provider configuration accepted by provider-loading APIs.

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:79](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L79)

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:82](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L82)

---

### env?

> `optional` **env?**: `EnvOverrides`

Defined in: [types/providers.ts:83](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L83)

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:77](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L77)

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:84](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L84)

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:78](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L78)

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/providers.ts:80](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L80)

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:81](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L81)
