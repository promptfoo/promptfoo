[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / AssertionOrSet

# Type Alias: AssertionOrSet

> **AssertionOrSet** = [`AssertionSet`](../interfaces/AssertionSet.md) \| [`Assertion`](../interfaces/Assertion.md)

Defined in: [types/index.ts:1059](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1059)

Assertion entry accepted by test cases.

Use a plain `Assertion` for one check or an `assert-set` when several checks
should be grouped under one threshold.

## Example

```ts
const assertion: AssertionOrSet = {
  type: 'contains',
  value: 'Ada',
};
```
