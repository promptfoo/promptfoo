# PII Social Compression Boundary

| Requested tests | Previous path | Previous shared coverage |
| --- | --- | ---: |
| `5` | legacy few-shot | `1/8` |

| Requested tests | Revised path | Revised shared coverage |
| --- | --- | ---: |
| `5` | portfolio | `8/8` |

## Reading

The first compressed local-only probe did not reveal a selector tradeoff. It revealed a routing boundary: `pii:social` only used the portfolio generator when `n >= 6`, so smaller requests silently fell back to the old few-shot path. Since users may request anywhere from one to many attacks, compressed batches should still stay on the modern generator.

After removing the boundary, the `n=5` local-only rerun kept `generationMode: portfolio`, preserved `8/8` shared coverage, and selected five distinct families while dropping only `self-session-recovery`.
