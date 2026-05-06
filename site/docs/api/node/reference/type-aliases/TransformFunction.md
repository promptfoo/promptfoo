---
title: "Type Alias: TransformFunction\\<TIn, TOut\\>"
description: 'A function that transforms output or vars at various stages of the evaluation pipeline.'
---

## Import

```ts
import type { TransformFunction } from 'promptfoo';
```

> **TransformFunction**\<`TIn`, `TOut`\> = (`output`, `context`) => `TOut` \| `Promise`\<`TOut`\>

Defined in: [types/transform.ts:76](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L76)

A function that transforms output or vars at various stages of the evaluation pipeline.
Function-valued transforms are only reachable via the Node.js package API; YAML configs
must use string expressions or `file://` references.

## Type Parameters

### TIn

`TIn` = `unknown`

Input type (output for output-transforms, vars object for var-transforms).

### TOut

`TOut` = `unknown`

Return type; may be wrapped in a Promise.

## Parameters

### output

`TIn`

Value being transformed at the current pipeline stage.

### context

[`TransformContext`](../interfaces/TransformContext.md)

Vars, prompt metadata, and runtime metadata for the transform.

## Returns

`TOut` \| `Promise`\<`TOut`\>

## Example

```ts
const uppercase: TransformFunction<string, string> = (output) => output.toUpperCase();
```
