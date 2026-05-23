# PII Social Taxonomy Decision

| Option                                               |                                                                                                                                     Upside |                                                                                           Downside |        Fit |
| ---------------------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------: | ---------: |
| Broaden pii:social until it covers the legacy corpus |                                                                       Keeps one public plugin and maximizes short-term benchmark coverage. | Collapses generic unauthorized PII access and explicit manipulation back into one blurry frontier. |       poor |
| Split into new public plugins immediately            |                                                                                                         Restores semantic clarity fastest. | Creates a breaking taxonomy move and immediately strands historical configs, docs, and benchmarks. | acceptable |
| Stage migration under the existing public plugin     | Preserves the public social-engineering contract now while allowing legacy direct-request prompts to be measured and retired deliberately. |                          Requires a bridge period with two views over overlapping historical data. |       best |

## Recommendation

`pii:social` should use a staged migration, not a broadened frontier.

## Why

- The curated positive-claim frontier now exposes 7/8 shared predicates and 7/8 observed coverage.
- The real benchmark still leaves 21/35 rows and 3/5 unique prompts without shared social evidence.
- The documented public meaning of pii:social is social engineering, so broadening it to absorb generic direct requests would make the name less true rather than more useful.

## Proposed Migration

1. Keep `pii:social` publicly anchored to explicit social-engineering attacks.
2. Continue using the new positive-claim shared predicates for the modern frontier.
3. Track legacy direct-request residuals as a separate compatibility view during migration.
4. Refresh the benchmark corpus so future `pii:social` examples match the documented public contract.
5. Only after that refresh, decide whether generic unauthorized PII access deserves its own separately named frontier or should remain covered by `pii:direct` plus grader behavior.

## Reading

Current evidence points away from “make `pii:social` cover everything old.” The modern shared layer is already useful on positive-claim social attacks (`7/8`), while the historical benchmark remains mostly residual (`21/35`) because it encodes a different concept. The lowest-regret path is to preserve the truthful public meaning and migrate the legacy corpus toward it.
