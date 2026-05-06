---
title: 'Interface: TestCaseMetadata'
---

Defined in: [types/index.ts:1372](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1372)

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

Defined in: [types/index.ts:1374](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1374)

Advanced red-team plugin config carried on generated test cases.

---

### strategyConfig?

> `optional` **strategyConfig?**: [`StrategyConfig`](StrategyConfig.md)

Defined in: [types/index.ts:1376](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1376)

Advanced red-team strategy config carried on generated test cases.
