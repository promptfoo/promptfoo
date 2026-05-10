# PII Social Pareto Frontier

| Candidate        | Source         | Leak-ready prompts | Regimes with any failure | Mean failure rate | On frontier | Dominated by |
| ---------------- | -------------- | ------------------ | ------------------------ | ----------------- | ----------- | ------------ |
| legacy-generic   | observed       | 1/6                | 0/3                      | 0%                | no          | portfolio, family-overfit, balanced-breadth |
| portfolio        | observed       | 6/6                | 2/3                      | 44%               | yes         | -            |
| family-overfit   | stress-profile | 6/6                | 1/3                      | 33%               | no          | portfolio    |
| balanced-breadth | stress-profile | 6/6                | 2/3                      | 22%               | no          | portfolio    |

## Reading

The Pareto view is a better reporting surface than another scalar leaderboard.
It keeps all three dimensions visible:

1. attack construction quality (`leak-ready prompts`)
2. cross-target breadth (`regimes with any failure`)
3. realized yield (`mean failure rate`)

On the observed-plus-stress set, `portfolio` is the only nondominated candidate:
it matches the stress profiles on leak-ready rate, matches the broadest profile
on target breadth, and exceeds both on realized yield. The more important point
is not the winner. It is that the report explains *why* `family-overfit` and
`balanced-breadth` are not equivalent, without hiding the tradeoff inside one
opaque scalar.
