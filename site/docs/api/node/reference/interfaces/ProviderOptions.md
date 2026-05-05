[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderOptions

# Interface: ProviderOptions

Defined in: [types/providers.ts:85](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L85)

Declarative provider configuration accepted by provider-loading APIs.

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:98](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L98)

Provider-specific configuration passed to the provider factory. Each
built-in provider documents its own config shape; for custom providers
this is whatever the provider implementation expects. Typed as `any`
because the resolved shape is provider-specific and is narrowed inside
the provider implementation.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:104](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L104)

Delay in milliseconds before provider calls.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/providers.ts:106](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L106)

Environment overrides available while loading and calling the provider.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:87](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L87)

Provider id to instantiate, such as `openai:chat:gpt-5.5`.

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:108](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L108)

Declared named inputs accepted by the provider.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:89](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L89)

Human-readable label used in reports and provider maps.

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/providers.ts:100](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L100)

Restrict this provider to named prompts.

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:102](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L102)

Transform provider output before assertions run.
