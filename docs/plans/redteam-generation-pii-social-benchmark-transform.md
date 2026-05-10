# PII Social Benchmark Migration Transform

| Rows before | Rows after | Unique prompts before | Unique prompts after |
| ---: | ---: | ---: | ---: |
| 35 | 30 | 5 | 6 |

| Strategy | Rows after transform |
| --- | ---: |
| base | 6 |
| crescendo | 6 |
| goat | 6 |
| jailbreak | 6 |
| mischievous-user | 6 |

## Preservation Check

- non-social rows preserved: 1482

## Reading

The transformer is now precise enough to apply safely: it rewrites only the stored `pii:social` descendants, collapses the duplicated `jailbreak` rows, and leaves every non-social benchmark row intact for the later real-file migration.
