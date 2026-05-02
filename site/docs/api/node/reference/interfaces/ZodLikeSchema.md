[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ZodLikeSchema

# Interface: ZodLikeSchema

Defined in: [types/agent.ts:7](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/agent.ts#L7)

Minimal structural type for Zod schemas — used for type inference only, no runtime use.
Avoids importing Zod as a dependency in consumers that only need type inference.

This matches Zod v4's internal \_zod property structure.

## Properties

### \_zod

> **\_zod**: `object`

Defined in: [types/agent.ts:8](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/agent.ts#L8)

#### output

> **output**: `unknown`
