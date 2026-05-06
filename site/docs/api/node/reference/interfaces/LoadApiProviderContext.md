[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / LoadApiProviderContext

# Interface: LoadApiProviderContext

Defined in: [types/index.ts:1673](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1673)

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

Defined in: [types/index.ts:1681](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1681)

Base path used to resolve relative config-file references.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/index.ts:1685](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1685)

Environment overrides available while loading the provider.

---

### options?

> `optional` **options?**: [`ProviderOptions`](ProviderOptions.md)

Defined in: [types/index.ts:1677](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1677)

Provider-specific options to merge into the resolved provider.
