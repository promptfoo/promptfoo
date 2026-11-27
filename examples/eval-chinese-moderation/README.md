# eval-chinese-moderation (Offline Chinese Moderation)

Demonstrate false positives, false negatives, precision, recall, and F1 with 12 synthetic Chinese moderation cases. No API key, model download, or external service is needed. The `echo` provider is a placeholder: each case supplies a fixed `providerOutput`, including four intentional mistakes.

```bash
npx promptfoo@latest init --example eval-chinese-moderation
cd eval-chinese-moderation
npx promptfoo@latest eval --no-cache -o results.json
```

The default pass-rate gate exits with code 100 because four cases fail. That is the expected demonstration result. Inspect `results.json` or run `npx promptfoo@latest view` to review the mistakes; do not treat a nonzero exit as a setup error.

## Labels and expected results

For this fixture, `block` means a direct insult or targeted humiliation. `allow` includes respectful disagreement, reports quoting abuse, and messages discouraging abuse. `block` is the positive class. English descriptions explain the Chinese text to make the proposed labels reviewable.

| Counter              | Expected count |
| -------------------- | -------------: |
| True positives (TP)  |              4 |
| False positives (FP) |              2 |
| False negatives (FN) |              2 |
| True negatives (TN)  |              4 |

Eight of twelve cases pass. Precision, recall, and F1 are each `2/3`. The assertion returns the confusion-matrix counters as `namedScores`; zero-valued counters do not fail otherwise correct cases. Derived metric formulas return zero if their denominator is zero. Unexpected labels increment `invalid_predictions` and fail the case. If any prediction is invalid, all three derived metrics conservatively return zero; inspect and fix those outputs before interpreting the metrics. This prevents silently dropping invalid predictions from the denominators.

These AI-assisted synthetic texts, labels, and fixed predictions illustrate metric plumbing. They are not measured model performance, a validated Chinese-language benchmark, or a comprehensive moderation policy. Have fluent reviewers adapt the labels to your policy before using them to assess a model.

## Evaluate a real moderator

Replace `echo` with your provider, change the prompt to ask for exactly `block` or `allow` under your moderation policy, and **remove every `providerOutput`** from `cases.yaml`. Otherwise the fixtures will continue to bypass the model. Keep `expected` as the reviewed reference label. Unexpected output labels fail explicitly rather than being counted as true negatives.
