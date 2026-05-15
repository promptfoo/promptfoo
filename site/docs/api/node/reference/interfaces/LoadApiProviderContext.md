---
title: 'Interface: LoadApiProviderContext'
description: 'Optional context accepted by loadApiProvider().'
---

## Import

```ts
import type { LoadApiProviderContext } from 'promptfoo';
```

Defined in: [types/index.ts:2068](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L2068)

Optional context accepted by `loadApiProvider()`.

Prefer passing per-load overrides here instead of mutating global process
state when a library needs to load providers on behalf of a caller.

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

Defined in: [types/index.ts:2076](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L2076)

Base path used to resolve relative config-file references.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/index.ts:2080](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L2080)

Environment overrides available while loading the provider.

---

### options?

> `optional` **options?**: [`ProviderOptions`](ProviderOptions.md)

Defined in: [types/index.ts:2072](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L2072)

Provider-specific options to merge into the resolved provider.
