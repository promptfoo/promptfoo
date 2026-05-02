[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EnvOverrides

# Type Alias: EnvOverrides

> **EnvOverrides** = `z.infer`\<_typeof_ `ProviderEnvOverridesSchema`\> & `Record`\<`string`, `string` \| `undefined`\>

Defined in: [types/env.ts:140](https://github.com/promptfoo/promptfoo/blob/main/src/types/env.ts#L140)

Environment-variable overrides accepted by provider-loading APIs.

Allows arbitrary environment variables for template rendering (for example,
`{{ env.MY_CUSTOM_VAR }}`) while preserving known provider keys.
