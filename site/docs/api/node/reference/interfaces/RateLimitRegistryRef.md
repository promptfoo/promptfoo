[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RateLimitRegistryRef

# Interface: RateLimitRegistryRef

Defined in: [types/index.ts:43](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L43)

Minimal interface for RateLimitRegistry to avoid circular dependency.
The actual implementation is in scheduler/rateLimitRegistry.ts.

## Properties

### dispose

> **dispose**: () => `void`

Defined in: [types/index.ts:53](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L53)

#### Returns

`void`

---

### execute

> **execute**: \<`T`\>(`provider`, `callFn`, `options?`) => `Promise`\<`T`\>

Defined in: [types/index.ts:44](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L44)

#### Type Parameters

##### T

`T`

#### Parameters

##### provider

[`ApiProvider`](ApiProvider.md)

##### callFn

() => `Promise`\<`T`\>

##### options?

###### getHeaders?

(`result`) => `Record`\<`string`, `string`\> \| `undefined`

###### getRetryAfter?

(`result`, `error?`) => `number` \| `undefined`

###### isRateLimited?

(`result`, `error?`) => `boolean`

#### Returns

`Promise`\<`T`\>
