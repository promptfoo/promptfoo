[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / ScoringFunction

# Type Alias: ScoringFunction

> **ScoringFunction** = (`namedScores`, `context?`) => `Promise`\<[`GradingResult`](../interfaces/GradingResult.md)\> \| [`GradingResult`](../interfaces/GradingResult.md)

Defined in: [types/index.ts:1204](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L1204)

Custom scorer used to aggregate named assertion scores for one test case.

## Parameters

### namedScores

`Record`\<`string`, `number`\>

### context?

#### componentResults?

[`GradingResult`](../interfaces/GradingResult.md)[]

#### parentAssertionSet?

\{ `assertionSet`: [`AssertionSet`](../interfaces/AssertionSet.md); `index`: `number`; \}

#### parentAssertionSet.assertionSet

[`AssertionSet`](../interfaces/AssertionSet.md)

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

## Example

```ts
const scoreAssertions: ScoringFunction = async (namedScores, context) => ({
  pass: Object.values(namedScores).every((score) => score >= 0.8),
  score: Math.min(...Object.values(namedScores)),
  reason: `Checked ${context?.componentResults?.length ?? 0} assertions`,
});
```
