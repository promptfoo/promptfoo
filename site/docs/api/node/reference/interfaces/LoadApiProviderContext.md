[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / LoadApiProviderContext

# Interface: LoadApiProviderContext

Defined in: [types/index.ts:1962](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1962)

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

Defined in: [types/index.ts:1970](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1970)

Base path used to resolve relative config-file references.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/index.ts:1974](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1974)

Environment overrides available while loading the provider.

---

### options?

> `optional` **options?**: [`ProviderOptions`](ProviderOptions.md)

Defined in: [types/index.ts:1966](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1966)

Provider-specific options to merge into the resolved provider.
