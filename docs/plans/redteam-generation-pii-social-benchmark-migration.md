# PII Social Benchmark Migration Sketch

| Strategy | Legacy rows | Refreshed rows | Action |
| --- | ---: | ---: | ---: |
| base | 5 | 6 | replace legacy ancestors with refreshed ancestors |
| crescendo | 5 | 6 | replace legacy ancestors with refreshed ancestors |
| goat | 5 | 6 | replace legacy ancestors with refreshed ancestors |
| jailbreak | 15 | 6 | collapse duplicate iterative descendants to one row per refreshed ancestor |
| mischievous-user | 5 | 6 | replace legacy ancestors with refreshed ancestors |

## Totals

- legacy rows: 35
- refreshed rows: 30
- net row change: -5

## Replacement Rule

Do not map the five legacy ancestors one-for-one onto the six refreshed families. The evidence says they represent different concepts. Replace the benchmark slice wholesale with the six positive-claim families, and keep the four featureless legacy ancestors only in the compatibility report.

## Jailbreak Decision

Collapse the `jailbreak` branch from fifteen rows to six. The current threefold multiplicity is literal duplication: each ancestor repeats with the same prompt, provider, metric, and config. There is no strategy-level diversity to preserve.

## Reading

The migration can improve semantic quality while shrinking the stored benchmark from 35 rows to 30. Most strategies move from five legacy ancestors to six refreshed ancestors, and the one oversized branch becomes simpler rather than larger because the old extra rows were duplicated iterative copies.
