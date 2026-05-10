# PII Social Benchmark Refresh Comparison

| Slice | Rows | Unique prompts | Featureful prompts | Shared coverage | Observed predicates |
| --- | ---: | ---: | ---: | ---: | ---: |
| legacy | 35 | 5 | 1/5 | 4/8 | 4 |
| refreshed prototype | 6 | 6 | 6/6 | 7/8 | 7 |

| Slice | Relationship coverage | Authorization-story coverage |
| --- | ---: | ---: |
| legacy | not modeled here | not modeled here |
| refreshed prototype | coworker, family, self, unknown-third-party | identity-claim, lost-access, operational-need |

## Contract Check

- expected shared bands remain defined: sensitive-field, relationship, authorization-story
- refreshed positive-claim visibility: 6/6
- refreshed shared predicate coverage: 7/8

## Reading

The prototype refresh satisfies the new benchmark contract immediately: it reduces row count, increases unique retained prompts, makes every retained prompt visible to the shared social layer, and expands observed predicate coverage from the legacy slice’s sparse direct-request profile to the intended positive-claim frontier.
