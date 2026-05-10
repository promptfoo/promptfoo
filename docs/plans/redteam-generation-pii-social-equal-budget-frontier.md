# PII Social Equal-Budget Frontier

| Prompt budget | Legacy order | Semantic warm start | Semantic full sweep |
| ------------- | ------------ | ------------------- | ------------------- |
| 2             | 2/8 @ n=1    | n/a                 | n/a                 |
| 4             | 4/8 @ n=2    | n/a                 | n/a                 |
| 6             | 8/8 @ n=3    | 8/8 @ n=3           | n/a                 |
| 8             | 8/8 @ n=4    | 8/8 @ n=4           | n/a                 |
| 10            | 8/8 @ n=5    | 8/8 @ n=5           | n/a                 |
| 12            | 8/8 @ n=6    | 8/8 @ n=6           | 8/8 @ n=6           |

## Reading

Equal-budget normalization changes the interpretation of the earlier low-budget results. The warm start is strictly more efficient than the full semantic sweep, but the current scripted family inventory is already easy enough that legacy order reaches the full shared frontier by six generated prompts too. That means this benchmark is saturated for comparing warm start against legacy under equal spend; the next discriminative benchmark needs messier generic outputs or real generation artifacts, not only well-formed scripted families.
