[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderConfig

# Type Alias: ProviderConfig

> **ProviderConfig** = `ProviderId` \| [`ProviderFunction`](ProviderFunction.md) \| [`ApiProvider`](../interfaces/ApiProvider.md) \| [`ProviderOptions`](../interfaces/ProviderOptions.md) \| `ProviderOptionsMap`

Defined in: [types/providers.ts:39](https://github.com/promptfoo/promptfoo/blob/main/src/types/providers.ts#L39)

Provider override accepted anywhere a single provider configuration is allowed.

## Example

```ts
const provider: ProviderConfig = {
  id: 'openai:chat:gpt-5.5',
  label: 'primary',
};
```
