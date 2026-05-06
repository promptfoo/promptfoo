[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderOptions

# Interface: ProviderOptions

Defined in: [types/providers.ts:134](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L134)

Declarative provider configuration accepted by provider-loading APIs.

## Example

```ts
const provider: ProviderOptions = {
  id: 'openai:chat:gpt-5.5',
  label: 'candidate',
  config: { temperature: 0.2 },
};
```

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L147)

Provider-specific configuration passed to the provider factory. Each
built-in provider documents its own config shape; for custom providers
this is whatever the provider implementation expects. Typed as `any`
because the resolved shape is provider-specific and is narrowed inside
the provider implementation.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:153](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L153)

Delay in milliseconds before provider calls.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/providers.ts:155](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L155)

Environment overrides available while loading and calling the provider.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:136](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L136)

Provider id to instantiate, such as `openai:chat:gpt-5.5`.

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:157](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L157)

Declared named inputs accepted by the provider.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:138](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L138)

Human-readable label used in reports and provider maps.

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/providers.ts:149](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L149)

Restrict this provider to named prompts.

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:151](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L151)

Transform provider output before assertions run.
