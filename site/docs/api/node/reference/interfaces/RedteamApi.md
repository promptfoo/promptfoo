[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RedteamApi

# Interface: RedteamApi

Defined in: [index.ts:128](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L128)

**`Beta`**

Advanced red team helpers exposed through the Node.js package.

This surface is still evolving; prefer the CLI and documented red team config
flows unless you specifically need programmatic orchestration.

## Properties

### Base

> **Base**: `object`

Defined in: [index.ts:142](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L142)

**`Beta`**

Base classes for advanced extension points.

#### Grader

> **Grader**: _typeof_ `RedteamGraderBase`

#### Plugin

> **Plugin**: _typeof_ `RedteamPluginBase`

---

### Extractors

> **Extractors**: `object`

Defined in: [index.ts:130](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L130)

**`Beta`**

Helpers for extracting target metadata before generation.

#### extractEntities

> **extractEntities**: (`provider`, `prompts`) => `Promise`\<`string`[]\>

##### Parameters

###### provider

[`ApiProvider`](ApiProvider.md)

###### prompts

`string`[]

##### Returns

`Promise`\<`string`[]\>

#### extractMcpToolsInfo

> **extractMcpToolsInfo**: (`providers`) => `Promise`\<`string`\>

Extract tools information from MCP providers and format for red team purpose

##### Parameters

###### providers

[`ApiProvider`](ApiProvider.md)[]

##### Returns

`Promise`\<`string`\>

#### extractSystemPurpose

> **extractSystemPurpose**: (`provider`, `prompts`) => `Promise`\<`string`\>

##### Parameters

###### provider

[`ApiProvider`](ApiProvider.md)

###### prompts

`string`[]

##### Returns

`Promise`\<`string`\>

---

### Graders

> **Graders**: `Record`\<`` `promptfoo:redteam:${string}` ``, `RedteamGraderBase`\>

Defined in: [index.ts:136](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L136)

**`Beta`**

Registered red team graders.

---

### Plugins

> **Plugins**: `PluginFactory`[]

Defined in: [index.ts:138](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L138)

**`Beta`**

Built-in red team plugins.

---

### Strategies

> **Strategies**: `Strategy`[]

Defined in: [index.ts:140](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L140)

**`Beta`**

Built-in red team strategies.

## Methods

### generate()

> **generate**(`options`): `Promise`\<[`RedteamGenerateResult`](../type-aliases/RedteamGenerateResult.md)\>

Defined in: [index.ts:147](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L147)

**`Beta`**

Generate a red team config programmatically.

#### Parameters

##### options

[`RedteamGenerateOptions`](../type-aliases/RedteamGenerateOptions.md)

#### Returns

`Promise`\<[`RedteamGenerateResult`](../type-aliases/RedteamGenerateResult.md)\>

---

### run()

> **run**(`options`): `Promise`\<[`RedteamRunResult`](../type-aliases/RedteamRunResult.md)\>

Defined in: [index.ts:149](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L149)

**`Beta`**

Run a red team eval programmatically.

#### Parameters

##### options

[`RedteamRunOptions`](RedteamRunOptions.md)

#### Returns

`Promise`\<[`RedteamRunResult`](../type-aliases/RedteamRunResult.md)\>
