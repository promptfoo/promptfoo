[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / LoadApiProviderContext

# Interface: LoadApiProviderContext

Defined in: [types/index.ts:1539](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1539)

Optional context accepted by `loadApiProvider()`.

## Properties

### basePath?

> `optional` **basePath?**: `string`

Defined in: [types/index.ts:1547](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1547)

Base path used to resolve relative config-file references.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [types/index.ts:1551](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1551)

Environment overrides available while loading the provider.

---

### options?

> `optional` **options?**: [`ProviderOptions`](ProviderOptions.md)

Defined in: [types/index.ts:1543](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1543)

Provider-specific options to merge into the resolved provider.
