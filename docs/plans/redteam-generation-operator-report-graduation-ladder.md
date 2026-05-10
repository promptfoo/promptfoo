# Operator Report Graduation Ladder

| Stage | Step               | Required evidence                                                     | Unlocks                                                   |
| ----- | ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------- |
| 1     | semantic frontier  | shared predicate frontier with explicit coverage target               | semantic comparison is possible                           |
| 2     | quality proxy      | prompt-level readiness or quality proxy                               | attack-shape quality is measurable                        |
| 3     | hardened regime    | replay against a hardened target                                      | good prompts can be separated from target susceptibility   |
| 4     | susceptible regime | replay against at least one susceptible target                        | realized yield can discriminate generators                 |
| 5     | suite aggregation  | multi-regime aggregation with breadth-sensitive reporting             | expected yield is evaluated across targets                 |
| 6     | operator report    | frontier, gaps, recommendations, and limitations in one report        | operator-facing selection is auditable                     |

## Reading

This is the reusable ladder the transfer audit was missing. A plugin should not
inherit the full operator report merely because it has a semantic frontier. It
graduates into that report only after it also has:

1. a quality proxy
2. hardened-target evidence
3. susceptible-target evidence
4. multi-regime aggregation
5. a final auditable report surface

Applied back to the current pair:

- `pii:social` is at stage `6`
- `pii:direct` is at stage `1`

That framing makes the next direct-PII work much clearer: do not rewrite the
report shell; build stages `2` through `5`.
