---
title: 'Interface: StrategyConfig'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 40
---

## Import

```ts
import type { StrategyConfig } from 'promptfoo';
```

Defined in: redteam/types.ts:482

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

Defined in: redteam/types.ts:484

Whether the strategy should be enabled.

---

### numTests?

> `optional` **numTests?**: `number`

Defined in: redteam/types.ts:488

Number of tests to generate for the strategy.

---

### plugins?

> `optional` **plugins?**: `string`[]

Defined in: redteam/types.ts:486

Plugin ids that this strategy should target.
