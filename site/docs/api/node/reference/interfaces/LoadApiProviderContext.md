[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / LoadApiProviderContext

# Interface: LoadApiProviderContext

Defined in: [types/index.ts:1526](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1526)

Optional context accepted by `loadApiProvider()`.

## Properties

### basePath?

> `optional` **basePath?**: `string`

Defined in: [types/index.ts:1534](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1534)

Base path used to resolve relative config-file references.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/index.ts:1538](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1538)

Environment overrides available while loading the provider.

---

### options?

> `optional` **options?**: [`ProviderOptions`](ProviderOptions.md)

Defined in: [types/index.ts:1530](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1530)

Provider-specific options to merge into the resolved provider.
