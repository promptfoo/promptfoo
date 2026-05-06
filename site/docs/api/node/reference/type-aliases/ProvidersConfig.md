[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProvidersConfig

# Type Alias: ProvidersConfig

> **ProvidersConfig** = `ProviderId` \| [`ProviderFunction`](ProviderFunction.md) \| [`ApiProvider`](../interfaces/ApiProvider.md) \| [`ProviderConfig`](ProviderConfig.md)[]

Defined in: [types/providers.ts:61](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L61)

Provider input accepted by `evaluate()` and `loadApiProviders()`.

Pass one provider id, provider function, provider object, or an array that
mixes the supported provider config forms.

## Example

```ts
const providers: ProvidersConfig = [
  'openai:chat:gpt-5.5',
  async (prompt) => ({ output: `Echo: ${prompt}` }),
];
```
