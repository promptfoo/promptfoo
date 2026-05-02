[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / LoadApiProviderContext

# Interface: LoadApiProviderContext

Defined in: [types/index.ts:1492](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1492)

Optional context accepted by `loadApiProvider()`.

## Properties

### basePath?

> `optional` **basePath?**: `string`

Defined in: [types/index.ts:1500](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1500)

Base path used to resolve relative config-file references.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/index.ts:1504](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1504)

Environment overrides available while loading the provider.

---

### options?

> `optional` **options?**: [`ProviderOptions`](ProviderOptions.md)

Defined in: [types/index.ts:1496](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1496)

Provider-specific options to merge into the resolved provider.
