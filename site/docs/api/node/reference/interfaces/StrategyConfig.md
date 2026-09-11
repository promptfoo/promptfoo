---
title: 'Interface: StrategyConfig'
description: 'This generated reference page documents the supported promptfoo Node.js API contract, including stable imports, signatures, fields, and application examples.'
sidebar_position: 40
---

## Import

```ts
import type { StrategyConfig } from 'promptfoo';
```

Defined in: [src/redteam/types.ts:311](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L311)

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

Defined in: [src/redteam/types.ts:313](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L313)

Whether the strategy should be enabled.

---

### numTests?

> `optional` **numTests?**: `number`

Defined in: [src/redteam/types.ts:317](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L317)

Number of tests to generate for the strategy.

---

### plugins?

> `optional` **plugins?**: `string`[]

Defined in: [src/redteam/types.ts:315](https://github.com/promptfoo/promptfoo/blob/main/src/redteam/types.ts#L315)

Plugin ids that this strategy should target.
