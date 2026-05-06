[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / isTransformFunction

# Function: isTransformFunction()

> **isTransformFunction**(`value`): `value is TransformFunction<unknown, unknown>`

Defined in: [types/transform.ts:96](https://github.com/promptfoo/promptfoo/blob/main/src/types/transform.ts#L96)

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
