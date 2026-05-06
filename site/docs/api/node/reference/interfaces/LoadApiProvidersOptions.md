---
title: 'Interface: LoadApiProvidersOptions'
description: 'Shared options for loading one or more providers.'
---

## Import

```ts
import type { LoadApiProvidersOptions } from 'promptfoo';
```

Defined in: [providers/index.ts:381](https://github.com/promptfoo/promptfoo/blob/main/src/providers/index.ts#L381)

Shared options for loading one or more providers.

Pass these when provider configs need a caller-controlled resolution base or
scoped environment values without mutating `process.env`.

## Example

```ts
const options: LoadApiProvidersOptions = {
  basePath: process.cwd(),
  env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
};
```

## Properties

### basePath?

> `optional` **basePath?**: `string`

Defined in: [providers/index.ts:383](https://github.com/promptfoo/promptfoo/blob/main/src/providers/index.ts#L383)

Base path used to resolve relative `file://` provider config references.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [providers/index.ts:385](https://github.com/promptfoo/promptfoo/blob/main/src/providers/index.ts#L385)

Environment overrides available while providers are loaded.
