[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProvidersConfig

# Type Alias: ProvidersConfig

> **ProvidersConfig** = `ProviderId` \| [`ProviderFunction`](ProviderFunction.md) \| [`ApiProvider`](../interfaces/ApiProvider.md) \| `ProviderConfig`[]

Defined in: [types/providers.ts:33](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L33)

Provider input accepted by `evaluate()` and `loadApiProviders()`.

Pass one provider id, provider function, provider object, or an array that
mixes the supported provider config forms.
