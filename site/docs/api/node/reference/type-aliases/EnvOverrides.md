---
title: 'Type Alias: EnvOverrides'
description: 'Environment-variable overrides accepted by provider-loading APIs.'
---

## Import

```ts
import type { EnvOverrides } from 'promptfoo';
```

> **EnvOverrides** = `z.infer`\<_typeof_ `ProviderEnvOverridesSchema`\> & `Record`\<`string`, `string` \| `undefined`\>

Defined in: [types/env.ts:150](https://github.com/promptfoo/promptfoo/blob/main/src/types/env.ts#L150)

Environment-variable overrides accepted by provider-loading APIs.

Every value is a string override or `undefined`. Built-in provider keys such
as `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are accepted, and arbitrary custom
keys are also allowed for template rendering (for example,
`{{ env.MY_CUSTOM_VAR }}`).

## Example

```ts
const env: EnvOverrides = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  MY_CUSTOM_VAR: 'preview',
};
```
