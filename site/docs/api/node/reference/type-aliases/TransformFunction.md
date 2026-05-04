[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / TransformFunction

# Type Alias: TransformFunction\<TIn, TOut\>

> **TransformFunction**\<`TIn`, `TOut`\> = (`output`, `context`) => `TOut` \| `Promise`\<`TOut`\>

Defined in: [types/transform.ts:38](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L38)

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

### context

[`TransformContext`](../interfaces/TransformContext.md)

## Returns

`TOut` \| `Promise`\<`TOut`\>
