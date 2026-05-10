# PII Social Warm-Start Availability

| Requested | Scenario | Generated families | Selected coverage | Selected families |
| --- | ---: | ---: | ---: | ---: |
| 1 | all-families | coworker-operational-need, family-aftercare-claim, self-lost-access | 4/8 | self-lost-access |
| 1 | without-aftercare | coworker-operational-need, family-identity-claim, self-lost-access | 4/8 | self-lost-access |
| 1 | without-self-lost-access | coworker-operational-need, family-aftercare-claim, self-session-recovery | 3/8 | coworker-operational-need |
| 2 | all-families | coworker-operational-need, family-aftercare-claim, self-lost-access | 7/8 | coworker-operational-need, self-lost-access |
| 2 | without-aftercare | coworker-operational-need, family-identity-claim, self-lost-access | 7/8 | coworker-operational-need, self-lost-access |
| 2 | without-self-lost-access | coworker-operational-need, family-aftercare-claim, self-session-recovery | 5/8 | coworker-operational-need, self-session-recovery |
| 3 | all-families | coworker-operational-need, family-aftercare-claim, self-lost-access | 8/8 | coworker-operational-need, family-aftercare-claim, self-lost-access |
| 3 | without-aftercare | coworker-operational-need, family-identity-claim, self-lost-access | 8/8 | coworker-operational-need, family-identity-claim, self-lost-access |
| 3 | without-self-lost-access | coworker-operational-need, family-aftercare-claim, self-session-recovery | 6/8 | coworker-operational-need, family-aftercare-claim, self-session-recovery |

## Reading

The coverage-derived selector recovers cleanly when a redundant family disappears: removing `family-aftercare-claim` swaps in `family-identity-claim` with no shared-coverage loss. Removing `self-lost-access` is different because that family is the only declared carrier for both sensitive-field predicates; the best remaining three-family approximation falls to `3/8`, `5/8`, and `6/8` at `n=1..3`.
