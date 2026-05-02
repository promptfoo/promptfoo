[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderOptions

# Interface: ProviderOptions

Defined in: [types/providers.ts:84](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L84)

Declarative provider configuration accepted by provider-loading APIs.

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:87](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L87)

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:90](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L90)

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/providers.ts:91](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L91)

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:85](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L85)

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:92](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L92)

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:86](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L86)

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/providers.ts:88](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L88)

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:89](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L89)
