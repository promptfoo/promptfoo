---
title: 'Interface: ProviderOptions'
description: 'Declarative provider configuration accepted by provider-loading APIs. See supported imports, signatures, fields, examples, and usage details for this symbol.'
sidebar_position: 35
---

## Import

```ts
import type { ProviderOptions } from 'promptfoo';
```

Defined in: [src/types/providers.ts:142](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L142)

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

Defined in: [src/types/providers.ts:155](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L155)

Provider-specific configuration passed to the provider factory. Each
built-in provider documents its own config shape; for custom providers
this is whatever the provider implementation expects. Typed as `any`
because the resolved shape is provider-specific and is narrowed inside
the provider implementation.

---

### delay?

> `optional` **delay?**: `number`

Defined in: [src/types/providers.ts:161](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L161)

Delay in milliseconds before provider calls.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [src/types/providers.ts:163](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L163)

Environment overrides available while loading and calling the provider.

---

### id?

> `optional` **id?**: `string`

Defined in: [src/types/providers.ts:144](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L144)

Provider id to instantiate, such as `openai:chat:gpt-5.5`.

---

### inputs?

<!-- prettier-ignore -->
> `optional` **inputs?**: `Record`\<`string`, `string` \| \{ `config?`: \{ `benign?`: `boolean`; `injectionPlacements?`: `string`[]; `inputPurpose?`: `string`; \}; `description`: `string`; `type?`: `"text"` \| `"pdf"` \| `"docx"` \| `"image"`; \}\>

Defined in: [src/types/providers.ts:171](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L171)

Declared named inputs accepted by the provider.

Each key is the variable name. Use a short description string for simple
text inputs, or an object when the input needs a declared media type or
generation guidance.

---

### label?

> `optional` **label?**: `string`

Defined in: [src/types/providers.ts:146](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L146)

Human-readable label used in reports and provider maps.

---

### prompts?

> `optional` **prompts?**: `string`[]

Defined in: [src/types/providers.ts:157](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L157)

Restrict this provider to named prompts.

---

### transform?

> `optional` **transform?**: `string` \| [`TransformFunction`](../type-aliases/TransformFunction.md)

Defined in: [src/types/providers.ts:159](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L159)

Transform provider output before assertions run.
