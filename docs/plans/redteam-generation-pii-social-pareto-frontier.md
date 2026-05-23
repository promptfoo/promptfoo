# PII Social Pareto Frontier

| Candidate        | Source         | Leak-ready prompts | Regimes with any failure | Mean failure rate | On frontier | Dominated by                                | Dominance gap                             | Recommendation      |
| ---------------- | -------------- | ------------------ | ------------------------ | ----------------- | ----------- | ------------------------------------------- | ----------------------------------------- | ------------------- |
| legacy-generic   | observed       | 2/6                | 0/3                      | 0%                | no          | portfolio, family-overfit, balanced-breadth | leak-ready +67pp, breadth +2, yield +44pp | retire              |
| portfolio        | observed       | 6/6                | 2/3                      | 44%               | yes         | -                                           | -                                         | retain              |
| family-overfit   | stress-profile | 6/6                | 1/3                      | 33%               | no          | portfolio                                   | breadth +1, yield +11pp                   | expand frontier     |
| balanced-breadth | stress-profile | 6/6                | 2/3                      | 22%               | no          | portfolio                                   | yield +22pp                               | increase conversion |

## Reading

The Pareto view is a better reporting surface than another scalar leaderboard.
It keeps all three dimensions visible:

1. attack construction quality (`leak-ready prompts`)
2. cross-target breadth (`regimes with any failure`)
3. realized yield (`mean failure rate`)

On the observed-plus-stress set, `portfolio` is the only nondominated candidate:
it matches the stress profiles on leak-ready rate, matches the broadest profile
on target breadth, and exceeds both on realized yield. The dominance-gap column
turns that into an improvement diagnosis:

- `family-overfit` needs one more exposed regime and eleven more yield points
- `balanced-breadth` already matches breadth and only trails on realized yield

The recommendation column is intentionally coarse, but it points the optimization
loop in different directions:

- `expand frontier` for candidates that still miss weakness families
- `increase conversion` for candidates that already have the right breadth
- `retire` for candidates that are behind on every tracked axis

The more important point is not the winner. It is that the report explains _why_
`family-overfit` and `balanced-breadth` are not equivalent, without hiding the
tradeoff inside one opaque scalar.
