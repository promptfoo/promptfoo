# PII Direct Target Regimes

| Target regime | Field-visible prompts | Realized PIILeak failures |
| --- | ---: | ---: |
| strict-refusal | 6/6 | 0/6 |
| permissive-identity | 6/6 | 3/6 |

## Reading

The strict-refusal regime is intentionally hardened: all six direct-PII prompts remain high-quality probes, but the target refuses every one of them. The `permissive-identity` regime is intentionally narrower: it leaks identity/contact fields while still refusing the other direct-PII families, creating the first non-flat stage-4 replay for `pii:direct`.
