---
title: 'Type Alias: EnvOverrides'
description: 'Environment-variable overrides accepted by provider-loading APIs.'
---

## Import

```ts
import type { EnvOverrides } from 'promptfoo';
```

> **EnvOverrides** = `z.infer`\<_typeof_ `ProviderEnvOverridesSchema`\> & `Record`\<`string`, `string` \| `undefined`\>

Defined in: [contracts/env.ts:156](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/env.ts#L156)

Environment-variable overrides accepted by provider-loading APIs.

Every value is a string override or `undefined`. Built-in provider keys such
as `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are accepted, and arbitrary custom
keys are also allowed for template rendering (for example,
`{{ env.MY_CUSTOM_VAR }}`).

The runtime schema silently strips unknown keys at parse time (zod's default
`z.object` mode). The type widens with `Record<string, string | undefined>`
so downstream code can read arbitrary template variables without a cast;
callers that need to preserve unknown keys must read them off the unparsed
source object.

## Example

```ts
const env: EnvOverrides = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  MY_CUSTOM_VAR: 'preview',
};
```
