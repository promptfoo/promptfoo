[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderOptions

# Interface: ProviderOptions

Defined in: [types/providers.ts:84](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L84)

Declarative provider configuration accepted by provider-loading APIs.

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:90](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L90)

Provider-specific configuration passed to the provider factory.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:96](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L96)

Delay in milliseconds before provider calls.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/providers.ts:98](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L98)

Environment overrides available while loading and calling the provider.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:86](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L86)

Provider id to instantiate, such as `openai:chat:gpt-5.5`.

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:100](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L100)

Declared named inputs accepted by the provider.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:88](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L88)

Human-readable label used in reports and provider maps.

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/providers.ts:92](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L92)

Restrict this provider to named prompts.

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:94](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L94)

Transform provider output before assertions run.
