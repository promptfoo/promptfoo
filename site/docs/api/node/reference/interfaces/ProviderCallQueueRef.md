[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ProviderCallQueueRef

# Interface: ProviderCallQueueRef

Defined in: [types/index.ts:59](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L59)

Minimal interface for deferred provider-call queues used by serial grading orchestration.

## Properties

### enqueue

> **enqueue**: \<`T`\>(`providerId`, `call`) => `Promise`\<`T`\>

Defined in: [types/index.ts:60](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L60)

#### Type Parameters

##### T

`T`

#### Parameters

##### providerId

`string`

##### call

() => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>
