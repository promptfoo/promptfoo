# Semantic Frontier Status

| Plugin | Bands | Threshold | Generated @ threshold | Selected @ threshold | Alignment shape | Parity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| pii:direct | 1 | 5 | 5 | 5 | exact-projection + separate-concept | yes |
| prompt-extraction | 2 | 5 | 6 | 5 | separate-concept | yes |
| sql-injection | 2 | 5 | 6 | 5 | coarser-rollup + exact-projection | yes |

## Candidate Shape Scan

| Plugin | Alignment shape | Adds new shape | Recommendation |
| --- | ---: | ---: | ---: |
| pii:social | coarser-rollup + separate-concept | yes | next informative target |
| excessive-agency | exact-projection | yes | defer |

## Reading

The productionized set now covers three distinct frontier shapes: exact-plus-separate (`pii:direct`), separate-only (`prompt-extraction`), and exact-plus-coarser (`sql-injection`). The next informative target is `pii:social`, not because it introduces a brand-new alignment kind, but because it is the first remaining plugin with the untested coarser-plus-separate combination. `excessive-agency` is exact-only, which would mostly repeat territory already exercised by the current production set.
