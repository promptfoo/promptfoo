---
title: 'Type Alias: AssertionValueFunction'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 2
---

## Import

```ts
import type { AssertionValueFunction } from 'promptfoo';
```

<!-- prettier-ignore -->
> **AssertionValueFunction** = (`output`, `context`) => `AssertionValueFunctionResult` \| `Promise`\<`AssertionValueFunctionResult`\>

Defined in: types/index.ts:1115

Function form accepted by JavaScript assertions.

Return `true`/`false`, a numeric score, or a full `GradingResult` when you
need to provide a custom score or reason.

## Parameters

### output

`string`

Provider output after any assertion-local transform.

### context

[`AssertionValueFunctionContext`](../interfaces/AssertionValueFunctionContext.md)

Prompt, vars, provider, and trace context for the current result.

## Returns

`AssertionValueFunctionResult` \| `Promise`\<`AssertionValueFunctionResult`\>

## Example

```ts
const containsName: AssertionValueFunction = (output) => ({
  pass: output.includes('Ada'),
  score: output.includes('Ada') ? 1 : 0,
  reason: output.includes('Ada') ? 'Name present' : 'Name missing',
});
```
