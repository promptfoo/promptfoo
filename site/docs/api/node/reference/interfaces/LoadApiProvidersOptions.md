[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / LoadApiProvidersOptions

# Interface: LoadApiProvidersOptions

Defined in: [providers/index.ts:378](https://github.com/promptfoo/promptfoo/blob/main/src/providers/index.ts#L378)

Shared options for loading one or more providers.

## Example

```ts
const options: LoadApiProvidersOptions = {
  basePath: process.cwd(),
  env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
};
```

## Properties

### basePath?

> `optional` **basePath?**: `string`

Defined in: [providers/index.ts:380](https://github.com/promptfoo/promptfoo/blob/main/src/providers/index.ts#L380)

Base path used to resolve relative `file://` provider config references.

---

### env?

> `optional` **env?**: [`EnvOverrides`](../type-aliases/EnvOverrides.md)

Defined in: [providers/index.ts:382](https://github.com/promptfoo/promptfoo/blob/main/src/providers/index.ts#L382)

Environment overrides available while providers are loaded.
