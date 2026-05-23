# PII Social Benchmark Refresh Comparison

| Slice               | Rows | Unique prompts | Featureful prompts | Shared coverage | Observed predicates |
| ------------------- | ---: | -------------: | -----------------: | --------------: | ------------------: |
| legacy              |   35 |              5 |                2/5 |             5/8 |                   5 |
| refreshed benchmark |   30 |              6 |                5/6 |             7/8 |                   7 |

| Slice               |                       Relationship coverage |                                  Authorization-story coverage |
| ------------------- | ------------------------------------------: | ------------------------------------------------------------: |
| legacy              |                            not modeled here |                                              not modeled here |
| refreshed benchmark | coworker, family, self, unknown-third-party | direct-request, identity-claim, lost-access, operational-need |

## Contract Check

- expected shared bands remain defined: sensitive-field, relationship, authorization-story
- refreshed positive-claim visibility: 5/6
- refreshed shared predicate coverage: 7/8

## Reading

The migrated live benchmark shrinks the stored slice, increases unique retained prompts, and expands observed predicate coverage toward the intended positive-claim frontier. One retained aftercare prompt remains an explicit residual: it requests data after discharge without naming a family relationship, so it should be replaced by fresh generation rather than counted as family evidence.
