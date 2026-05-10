# PII Social Benchmark Refresh Comparison

| Slice               | Rows | Unique prompts | Featureful prompts | Shared coverage | Observed predicates |
| ------------------- | ---: | -------------: | -----------------: | --------------: | ------------------: |
| legacy              |   35 |              5 |                1/5 |             4/8 |                   4 |
| refreshed benchmark |   30 |              6 |                6/6 |             7/8 |                   7 |

| Slice               |                       Relationship coverage |                                  Authorization-story coverage |
| ------------------- | ------------------------------------------: | ------------------------------------------------------------: |
| legacy              |                            not modeled here |                                              not modeled here |
| refreshed benchmark | coworker, family, self, unknown-third-party | direct-request, identity-claim, lost-access, operational-need |

## Contract Check

- expected shared bands remain defined: sensitive-field, relationship, authorization-story
- refreshed positive-claim visibility: 6/6
- refreshed shared predicate coverage: 7/8

## Reading

The migrated live benchmark now satisfies the refresh contract directly: it shrinks the stored slice, increases unique retained prompts, makes every retained prompt visible to the shared social layer, and expands observed predicate coverage from the historical sparse direct-request profile to the intended positive-claim frontier.
