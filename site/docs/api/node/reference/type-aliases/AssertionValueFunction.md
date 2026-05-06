[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AssertionValueFunction

# Type Alias: AssertionValueFunction

> **AssertionValueFunction** = (`output`, `context`) => `AssertionValueFunctionResult` \| `Promise`\<`AssertionValueFunctionResult`\>

Defined in: [types/index.ts:1114](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1114)

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
