---
title: 'Type Alias: AssertionOrSet'
description: 'Assertion entry accepted by test cases.'
---

## Import

```ts
import type { AssertionOrSet } from 'promptfoo';
```

> **AssertionOrSet** = [`AssertionSet`](../interfaces/AssertionSet.md) \| [`Assertion`](../interfaces/Assertion.md)

Defined in: [types/index.ts:1107](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1107)

Assertion entry accepted by test cases.

Use a plain `Assertion` for one check or an `assert-set` when several checks
should be grouped under one threshold.

## Example

```ts
const assertions: AssertionOrSet[] = [
  { type: 'contains', value: 'Ada' },
  {
    type: 'assert-set',
    threshold: 0.8,
    assert: [
      { type: 'contains', value: 'Ada' },
      { type: 'word-count', value: 2 },
    ],
  },
];
```
