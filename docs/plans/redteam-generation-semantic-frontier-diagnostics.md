# Semantic Frontier Diagnostics

| Plugin | Frontiers | Complete runs | Structural degradation | Unreachable features |
| --- | ---: | ---: | ---: | ---: |
| pii:social:all-families | 1 | 1 | no | none |
| pii:social:without-aftercare | 1 | 1 | no | none |
| pii:social:without-self-lost-access | 1 | 0 | yes | requestsPrescriptionDetails, requestsRefillDates |

## Reading

A plugin-level diagnostic can now distinguish healthy compression from structural loss without inspecting every retained prompt. In the availability study, only the `without-self-lost-access` scenario is structurally degraded, and it reports `requestsPrescriptionDetails` plus `requestsRefillDates` as unreachable.
