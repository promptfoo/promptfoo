[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / RedteamApi

# Interface: RedteamApi

Defined in: [index.ts:455](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L455)

**`Beta`**

Advanced red team helpers exposed through the Node.js package.

This surface is still evolving; prefer the CLI and documented red team config
flows unless you specifically need programmatic orchestration.

## Properties

### Base

> **Base**: `object`

Defined in: [index.ts:469](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L469)

**`Beta`**

Base classes for advanced extension points.

#### Grader

> **Grader**: _typeof_ `RedteamGraderBase`

#### Plugin

> **Plugin**: _typeof_ `RedteamPluginBase`

---

### Extractors

> **Extractors**: `object`

Defined in: [index.ts:457](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L457)

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

Defined in: [index.ts:463](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L463)

**`Beta`**

Registered red team graders.

---

### Plugins

> **Plugins**: `PluginFactory`[]

Defined in: [index.ts:465](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L465)

**`Beta`**

Built-in red team plugins.

---

### Strategies

> **Strategies**: `Strategy`[]

Defined in: [index.ts:467](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L467)

**`Beta`**

Built-in red team strategies.

## Methods

### generate()

> **generate**(`options`): `Promise`\<[`RedteamGenerateResult`](../type-aliases/RedteamGenerateResult.md)\>

Defined in: [index.ts:474](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L474)

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

Defined in: [index.ts:476](https://github.com/promptfoo/promptfoo/blob/main/src/index.ts#L476)

**`Beta`**

Run a red team eval programmatically.

#### Parameters

##### options

[`RedteamRunOptions`](RedteamRunOptions.md)

#### Returns

`Promise`\<[`RedteamRunResult`](../type-aliases/RedteamRunResult.md)\>
