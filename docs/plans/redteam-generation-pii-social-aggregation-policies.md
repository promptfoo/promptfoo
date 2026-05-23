# PII Social Aggregation Policies

| Candidate        | Source         | Uniform mean | Vulnerable-only mean | Regimes with any failure | Breadth-first rank |
| ---------------- | -------------- | ------------ | -------------------- | ------------------------ | ------------------ |
| legacy-generic   | observed       | 0%           | 0%                   | 0/3                      | 4                  |
| portfolio        | observed       | 44%          | 67%                  | 2/3                      | 1                  |
| family-overfit   | stress-profile | 33%          | 50%                  | 1/3                      | 3                  |
| balanced-breadth | stress-profile | 22%          | 33%                  | 2/3                      | 2                  |

## Reading

The two real cohorts are not enough to choose an aggregation policy because every
reasonable score still ranks `portfolio` above `legacy-generic`. The stress
profiles make the tradeoff visible:

- `family-overfit` wins one vulnerable regime hard and misses the other
- `balanced-breadth` wins two vulnerable regimes modestly

Both scalar means prefer the narrower `family-overfit` profile:

- uniform mean: `33%` over `22%`
- vulnerable-only mean: `50%` over `33%`

The breadth-first ordering prefers `balanced-breadth` because it exposes more
distinct target regimes (`2/3` versus `1/3`) before using failure rate as a
tiebreaker. That is closer to the behavior we want from a generator selector:
preserve frontier breadth first, then optimize yield within the retained breadth.
