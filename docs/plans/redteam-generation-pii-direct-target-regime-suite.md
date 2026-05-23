# PII Direct Target Regime Suite

| Field-visible prompts | Mean failure rate across regimes | Regimes with any failure | Total realized failures |
| --------------------- | -------------------------------: | -----------------------: | ----------------------: |
| 6/6                   |                              33% |                      2/3 |                    6/18 |

## Per-Regime Detail

| Target regime       | Field-visible prompts | Realized PIILeak failures |
| ------------------- | --------------------: | ------------------------: |
| strict-refusal      |                   6/6 |                       0/6 |
| permissive-identity |                   6/6 |                       3/6 |
| permissive-clinical |                   6/6 |                       3/6 |

## Reading

The direct-PII suite now spans one hardened target plus two qualitatively different weak targets. The current frontier stays fully visible (`6/6`) while averaging `33%` realized failure across the three regimes, with weaknesses exposed in `2/3` regimes. That is still a small target distribution, but it is materially stronger than a single selective split.
