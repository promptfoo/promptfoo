# PII Social Low-Budget Warm Start

| Requested |            Strategy | Generated families | Generator prompts requested | Selected coverage |                                                                                                                               Selected families |
| --------- | ------------------: | -----------------: | --------------------------: | ----------------: | ----------------------------------------------------------------------------------------------------------------------------------------------: |
| 1         | semantic-full-sweep |                  6 |                          12 |               4/8 |                                                                                                                                self-lost-access |
| 1         | semantic-warm-start |                  3 |                           6 |               4/8 |                                                                                                                                self-lost-access |
| 2         | semantic-full-sweep |                  6 |                          12 |               7/8 |                                                                                                     coworker-operational-need, self-lost-access |
| 2         | semantic-warm-start |                  3 |                           6 |               7/8 |                                                                                                     coworker-operational-need, self-lost-access |
| 3         | semantic-full-sweep |                  6 |                          12 |               8/8 |                                                                              coworker-operational-need, family-identity-claim, self-lost-access |
| 3         | semantic-warm-start |                  3 |                           6 |               8/8 |                                                                             coworker-operational-need, family-aftercare-claim, self-lost-access |
| 4         | semantic-full-sweep |                  6 |                          12 |               8/8 |                                                       coworker-operational-need, family-identity-claim, self-lost-access, self-session-recovery |
| 4         | semantic-warm-start |                  4 |                           8 |               8/8 |                                                      coworker-operational-need, family-aftercare-claim, family-identity-claim, self-lost-access |
| 5         | semantic-full-sweep |                  6 |                          12 |               8/8 |                         coworker-operational-need, family-identity-claim, self-lost-access, self-session-recovery, third-party-operational-need |
| 5         | semantic-warm-start |                  5 |                          10 |               8/8 |                               coworker-operational-need, family-aftercare-claim, family-identity-claim, self-lost-access, self-session-recovery |
| 6         | semantic-full-sweep |                  6 |                          12 |               8/8 | coworker-operational-need, family-aftercare-claim, family-identity-claim, self-lost-access, self-session-recovery, third-party-operational-need |
| 6         | semantic-warm-start |                  6 |                          12 |               8/8 | coworker-operational-need, family-aftercare-claim, family-identity-claim, self-lost-access, self-session-recovery, third-party-operational-need |

## Reading

A three-family semantic warm start preserves the full-sweep low-budget gains while removing most of the excess work. It keeps `4/8` at `n=1`, `7/8` at `n=2`, and `8/8` from `n=3` onward, while reducing generator prompts from `12` to `6` for `n=1..3`, `8` at `n=4`, and `10` at `n=5`.
