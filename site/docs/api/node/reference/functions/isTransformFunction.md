---
title: 'Function: isTransformFunction()'
description: 'Runtime type guard for TransformFunction values.'
sidebar_position: 3
---

## Import

```ts
import { isTransformFunction } from 'promptfoo';
```

> **isTransformFunction**(`value`): `value is TransformFunction<unknown, unknown>`

Defined in: [contracts/transform.ts:96](https://github.com/promptfoo/promptfoo/blob/main/src/contracts/transform.ts#L96)

Runtime type guard for `TransformFunction` values.

## Parameters

### value

`unknown`

Candidate value to test.

## Returns

`value is TransformFunction<unknown, unknown>`

`true` when `value` is callable as a transform function.

## Example

```ts
if (isTransformFunction(config.transform)) {
  await config.transform('hello', { vars: {} });
}
```
