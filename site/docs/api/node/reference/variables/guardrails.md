[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / guardrails

# Variable: guardrails

> `const` **guardrails**: `object`

Defined in: [guardrails.ts:100](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/guardrails.ts#L100)

**`Beta`**

Programmatic access to promptfoo guardrail endpoints.

## Type Declaration

### adaptive()

> **adaptive**(`request`): `Promise`\<`AdaptiveResult`\>

#### Parameters

##### request

`AdaptiveRequest`

#### Returns

`Promise`\<`AdaptiveResult`\>

### guard()

> **guard**(`input`): `Promise`\<`GuardResult`\>

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`GuardResult`\>

### harm()

> **harm**(`input`): `Promise`\<`GuardResult`\>

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`GuardResult`\>

### pii()

> **pii**(`input`): `Promise`\<`GuardResult`\>

#### Parameters

##### input

`string`

#### Returns

`Promise`\<`GuardResult`\>
