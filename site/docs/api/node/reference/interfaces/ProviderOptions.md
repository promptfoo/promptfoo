---
title: 'Interface: ProviderOptions'
description: 'Declarative provider configuration accepted by provider-loading APIs.'
---

## Import

```ts
import type { ProviderOptions } from 'promptfoo';
```

Defined in: [types/providers.ts:135](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L135)

Declarative provider configuration accepted by provider-loading APIs.

## Example

```ts
const provider: ProviderOptions = {
  id: 'openai:chat:gpt-5.5',
  label: 'candidate',
  config: { temperature: 0.2 },
  inputs: {
    resume: {
      description: 'Resume PDF to summarize',
      type: 'pdf',
    },
  },
};
```

## Properties

### config?

> `optional` **config?**: `any`

Defined in: [types/providers.ts:148](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L148)

Provider-specific configuration passed to the provider factory. Each
built-in provider documents its own config shape; for custom providers
this is whatever the provider implementation expects. Typed as `any`
because the resolved shape is provider-specific and is narrowed inside
the provider implementation.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [types/providers.ts:154](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L154)

Delay in milliseconds before provider calls.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/providers.ts:156](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L156)

Environment overrides available while loading and calling the provider.

---

### id?

> `optional` **id?**: `string`

Defined in: [types/providers.ts:137](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L137)

Provider id to instantiate, such as `openai:chat:gpt-5.5`.

---

### inputs?

> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [types/providers.ts:164](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L164)

Declared named inputs accepted by the provider.

Each key is the variable name. Use a short description string for simple
text inputs, or an object when the input needs a declared media type or
generation guidance.

---

### label?

> `optional` **label?**: `string`

Defined in: [types/providers.ts:139](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L139)

Human-readable label used in reports and provider maps.

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [types/providers.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L150)

Restrict this provider to named prompts.

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [types/providers.ts:152](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L152)

Transform provider output before assertions run.
