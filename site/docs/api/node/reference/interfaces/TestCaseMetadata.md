---
title: 'Interface: TestCaseMetadata'
description: 'Arbitrary metadata attached to a test case.'
---

## Import

```ts
import type { TestCaseMetadata } from 'promptfoo';
```

Defined in: [types/index.ts:1443](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1443)

Arbitrary metadata attached to a test case.

Known red-team fields are typed, and additional keys are preserved for custom
integrations.

## Example

```ts
const metadata: TestCaseMetadata = {
  source: 'golden-set',
  pluginConfig: { language: 'Spanish' },
};
```

## Indexable

> \[`key`: `string`\]: `any`

## Properties

### pluginConfig?

> `optional` **pluginConfig?**: [`PluginConfig`](PluginConfig.md)

Defined in: [types/index.ts:1445](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1445)

Advanced red-team plugin config carried on generated test cases.

---

### strategyConfig?

> `optional` **strategyConfig?**: [`StrategyConfig`](StrategyConfig.md)

Defined in: [types/index.ts:1447](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1447)

Advanced red-team strategy config carried on generated test cases.
