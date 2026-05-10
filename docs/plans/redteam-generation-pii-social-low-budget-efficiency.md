# PII Social Low-Budget Efficiency

| Requested | Strategy | Generated families | Generator prompts requested | Selected coverage | Selected families |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | legacy-order | 1 | 2 | 2/8 | family-identity-claim |
| 1 | semantic-low-budget | 6 | 12 | 4/8 | self-lost-access |
| 2 | legacy-order | 2 | 4 | 4/8 | coworker-operational-need, family-identity-claim |
| 2 | semantic-low-budget | 6 | 12 | 7/8 | coworker-operational-need, self-lost-access |
| 3 | legacy-order | 3 | 6 | 8/8 | coworker-operational-need, family-identity-claim, self-lost-access |
| 3 | semantic-low-budget | 6 | 12 | 8/8 | coworker-operational-need, family-identity-claim, self-lost-access |
| 4 | legacy-order | 4 | 8 | 8/8 | coworker-operational-need, family-identity-claim, self-lost-access, third-party-operational-need |
| 4 | semantic-low-budget | 6 | 12 | 8/8 | coworker-operational-need, family-identity-claim, self-lost-access, self-session-recovery |
| 5 | legacy-order | 5 | 10 | 8/8 | coworker-operational-need, family-aftercare-claim, family-identity-claim, self-lost-access, third-party-operational-need |
| 5 | semantic-low-budget | 6 | 12 | 8/8 | coworker-operational-need, family-identity-claim, self-lost-access, self-session-recovery, third-party-operational-need |
| 6 | legacy-order | 6 | 12 | 8/8 | coworker-operational-need, family-aftercare-claim, family-identity-claim, self-lost-access, self-session-recovery, third-party-operational-need |
| 6 | semantic-low-budget | 6 | 12 | 8/8 | coworker-operational-need, family-aftercare-claim, family-identity-claim, self-lost-access, self-session-recovery, third-party-operational-need |

## Reading

The semantic low-budget policy buys better tiny-batch coverage by paying the full six-family generation cost early. At `n=1`, it improves from `2/8` to `4/8` while increasing generator prompts from `2` to `12`; at `n=2`, it improves from `4/8` to `7/8` while increasing prompts from `4` to `12`. Once the frontier saturates at `n=3`, the quality gap disappears but the extra work remains until the normal six-test threshold.
