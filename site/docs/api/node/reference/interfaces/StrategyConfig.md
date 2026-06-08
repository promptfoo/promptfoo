---
title: 'Interface: StrategyConfig'
description: 'Advanced strategy configuration carried on generated red-team test cases.'
sidebar_position: 42
---

## Import

```ts
import type { StrategyConfig } from 'promptfoo';
```

Defined in: [redteam/types.ts:482](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L482)

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

Defined in: [redteam/types.ts:484](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L484)

Whether the strategy should be enabled.

---

### numTests?

> `optional` **numTests?**: `number`

Defined in: [redteam/types.ts:488](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L488)

Number of tests to generate for the strategy.

---

### plugins?

> `optional` **plugins?**: `string`[]

Defined in: [redteam/types.ts:486](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L486)

Plugin ids that this strategy should target.
