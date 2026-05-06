---
title: 'Interface: StrategyConfig'
---

Defined in: [redteam/types.ts:476](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L476)

Advanced strategy configuration carried on generated red-team test cases.

## Example

```ts
const strategyConfig: StrategyConfig = {
  enabled: true,
  plugins: ['prompt-injection'],
  numTests: 5,
};
```

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### enabled?

> `optional` **enabled?**: `boolean`

Defined in: [redteam/types.ts:478](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L478)

Whether the strategy should be enabled.

---

### numTests?

> `optional` **numTests?**: `number`

Defined in: [redteam/types.ts:482](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L482)

Number of tests to generate for the strategy.

---

### plugins?

> `optional` **plugins?**: `string`[]

Defined in: [redteam/types.ts:480](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L480)

Plugin ids that this strategy should target.
