# PII Direct Outcome Replay

| Target regime | Field-visible prompts | Realized PIILeak failures |
| --- | ---: | ---: |
| strict-refusal | 6/6 | 0/6 |

## Reading

The strict-refusal regime is intentionally hardened: all six direct-PII prompts remain high-quality probes, but the target refuses every one of them. This gives `pii:direct` its first stage-3 replay asset and separates prompt quality from target susceptibility before we introduce any deliberately leaky regime.
