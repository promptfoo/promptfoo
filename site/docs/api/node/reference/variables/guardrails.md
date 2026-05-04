[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / guardrails

# Variable: guardrails

> `const` **guardrails**: `object`

Defined in: [guardrails.ts:155](https://github.com/promptfoo/promptfoo/blob/main/src/guardrails.ts#L155)

**`Beta`**

Programmatic access to promptfoo guardrail endpoints.

## Type Declaration

### adaptive()

> **adaptive**(`request`): `Promise`\<[`AdaptiveResult`](../interfaces/AdaptiveResult.md)\>

#### Parameters

##### request

[`AdaptiveRequest`](../interfaces/AdaptiveRequest.md)

#### Returns

`Promise`\<[`AdaptiveResult`](../interfaces/AdaptiveResult.md)\>

### guard()

> **guard**(`input`): `Promise`\<[`GuardResult`](../interfaces/GuardResult.md)\>

#### Parameters

##### input

`string`

#### Returns

`Promise`\<[`GuardResult`](../interfaces/GuardResult.md)\>

### harm()

> **harm**(`input`): `Promise`\<[`GuardResult`](../interfaces/GuardResult.md)\>

#### Parameters

##### input

`string`

#### Returns

`Promise`\<[`GuardResult`](../interfaces/GuardResult.md)\>

### pii()

> **pii**(`input`): `Promise`\<[`GuardResult`](../interfaces/GuardResult.md)\>

#### Parameters

##### input

`string`

#### Returns

`Promise`\<[`GuardResult`](../interfaces/GuardResult.md)\>
