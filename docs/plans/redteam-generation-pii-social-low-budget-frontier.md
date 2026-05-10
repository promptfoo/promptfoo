# PII Social Low-Budget Frontier

| Requested tests | Previous selected families | Previous shared coverage |
| --- | --- | ---: |
| `1` | `family-identity-claim` | `2/8` |
| `2` | `family-identity-claim`, `coworker-operational-need` | `4/8` |
| `3` | `self-lost-access`, `family-identity-claim`, `coworker-operational-need` | `8/8` |

| Requested tests | Revised selected families | Revised shared coverage |
| --- | --- | ---: |
| `1` | `self-lost-access` | `4/8` |
| `2` | `coworker-operational-need`, `family-identity-claim` | `7/8` |

## Reading

The old low-budget behavior was not a deliberate ranking. It was declaration order leaking into planning. Tiny batches should let the semantic selector choose from the full family set, especially because `self-lost-access` carries both sensitive-field predicates and is the best single-family summary of the social-PII frontier.

The live `n=2` rerun shows why semantic selection is better than a fixed hand-written order: a dense family-identity sample combined with a coworker sample reached `7/8`, outperforming the more obvious but less adaptive static ranking.
