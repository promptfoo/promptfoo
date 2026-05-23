# PII Social Warm-Start Order Sensitivity

| Requested | Strategy | Order | Generated families | Selected coverage | Selected families |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | coverage-derived | current-order | coworker-operational-need, family-aftercare-claim, self-lost-access | 4/8 | self-lost-access |
| 1 | coverage-derived | reordered | coworker-operational-need, family-aftercare-claim, self-lost-access | 4/8 | self-lost-access |
| 1 | source-order | current-order | coworker-operational-need, family-identity-claim, self-lost-access | 4/8 | self-lost-access |
| 1 | source-order | reordered | family-aftercare-claim, self-session-recovery, third-party-operational-need | 2/8 | self-session-recovery |
| 2 | coverage-derived | current-order | coworker-operational-need, family-aftercare-claim, self-lost-access | 7/8 | coworker-operational-need, self-lost-access |
| 2 | coverage-derived | reordered | coworker-operational-need, family-aftercare-claim, self-lost-access | 7/8 | coworker-operational-need, self-lost-access |
| 2 | source-order | current-order | coworker-operational-need, family-identity-claim, self-lost-access | 7/8 | coworker-operational-need, self-lost-access |
| 2 | source-order | reordered | family-aftercare-claim, self-session-recovery, third-party-operational-need | 4/8 | family-aftercare-claim, self-session-recovery |
| 3 | coverage-derived | current-order | coworker-operational-need, family-aftercare-claim, self-lost-access | 8/8 | coworker-operational-need, family-aftercare-claim, self-lost-access |
| 3 | coverage-derived | reordered | coworker-operational-need, family-aftercare-claim, self-lost-access | 8/8 | coworker-operational-need, family-aftercare-claim, self-lost-access |
| 3 | source-order | current-order | coworker-operational-need, family-identity-claim, self-lost-access | 8/8 | coworker-operational-need, family-identity-claim, self-lost-access |
| 3 | source-order | reordered | family-aftercare-claim, self-session-recovery, third-party-operational-need | 5/8 | family-aftercare-claim, self-session-recovery, third-party-operational-need |

## Reading

The source-order warm start is brittle: reordering the same family set drops `n=1` from `4/8` to `2/8`, `n=2` from `7/8` to `4/8`, and `n=3` from `8/8` to `5/8`. The coverage-derived warm start keeps the same three semantic roles and preserves `4/8`, `7/8`, and `8/8` under both orderings.
