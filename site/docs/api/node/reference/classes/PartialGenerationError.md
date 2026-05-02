[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PartialGenerationError

# Class: PartialGenerationError

Defined in: [redteam/types.ts:455](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L455)

Custom error class for partial test generation failures.
Thrown when some plugins completely fail to generate any test cases,
which would significantly impact scan quality and completeness.

## Extends

- `Error`

## Constructors

### Constructor

> **new PartialGenerationError**(`failedPlugins`): `PartialGenerationError`

Defined in: [redteam/types.ts:458](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L458)

#### Parameters

##### failedPlugins

[`FailedPluginInfo`](../interfaces/FailedPluginInfo.md)[]

#### Returns

`PartialGenerationError`

#### Overrides

`Error.constructor`

## Properties

### failedPlugins

> `readonly` **failedPlugins**: [`FailedPluginInfo`](../interfaces/FailedPluginInfo.md)[]

Defined in: [redteam/types.ts:456](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/redteam/types.ts#L456)
