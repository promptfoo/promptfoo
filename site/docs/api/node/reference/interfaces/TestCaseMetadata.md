---
title: 'Interface: TestCaseMetadata'
description: 'Arbitrary metadata attached to a test case. See the supported promptfoo Node.js API imports, signatures, fields, and application examples for this symbol.'
sidebar_position: 42
---

## Import

```ts
import type { TestCaseMetadata } from 'promptfoo';
```

Defined in: types/index.ts:1390

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

Defined in: types/index.ts:1346

Advanced red-team plugin config carried on generated test cases.

---

### strategyConfig?

> `optional` **strategyConfig?**: [`StrategyConfig`](StrategyConfig.md)

Defined in: types/index.ts:1348

Advanced red-team strategy config carried on generated test cases.
