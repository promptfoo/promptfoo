[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ScoringFunction

# Type Alias: ScoringFunction

> **ScoringFunction** = (`namedScores`, `context?`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\> \| [`GradingResult`](../interfaces/GradingResult.md)

Defined in: [types/index.ts:816](https://github.com/promptfoo/promptfoo/blob/6b351a0b374cb2eb7e8305361baf5611e052f630/src/types/index.ts#L816)

## Parameters

### namedScores

`Record`\<`string`, `number`\>

### context?

#### componentResults?

[`GradingResult`](../interfaces/GradingResult.md)[]

#### parentAssertionSet?

\{ `assertionSet`: [`AssertionSet`](AssertionSet.md); `index`: `number`; \}

#### parentAssertionSet.assertionSet

[`AssertionSet`](AssertionSet.md)

#### parentAssertionSet.index

`number`

#### threshold?

`number`

#### tokensUsed?

\{ `completion`: `number`; `prompt`: `number`; `total`: `number`; \}

#### tokensUsed.completion

`number`

#### tokensUsed.prompt

`number`

#### tokensUsed.total

`number`

## Returns

`Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\> \| [`GradingResult`](../interfaces/GradingResult.md)
