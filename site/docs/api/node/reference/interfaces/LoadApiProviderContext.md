---
title: 'Interface: LoadApiProviderContext'
---

Defined in: [types/index.ts:1993](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1993)

Optional context accepted by `loadApiProvider()`.

## Example

```ts
const context: LoadApiProviderContext = {
  basePath: process.cwd(),
  env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
};
```

## Properties

### basePath?

> `optional` **basePath?**: `string`

Defined in: [types/index.ts:2001](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L2001)

Base path used to resolve relative config-file references.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/index.ts:2005](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L2005)

Environment overrides available while loading the provider.

---

### options?

> `optional` **options?**: [`ProviderOptions`](ProviderOptions.md)

Defined in: [types/index.ts:1997](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1997)

Provider-specific options to merge into the resolved provider.
