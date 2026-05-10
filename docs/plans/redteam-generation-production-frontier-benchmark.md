# Production Semantic Frontier Benchmark

| Plugin | Requested | Generated families | Selected tests | Frontier active | Frontier complete |
| --- | ---: | ---: | ---: | ---: | ---: |
| prompt-extraction | 4 | 4 | 4 | no | no |
| prompt-extraction | 5 | 6 | 5 | yes | yes |
| sql-injection | 4 | 4 | 4 | no | no |
| sql-injection | 5 | 6 | 5 | yes | yes |

## Compression Point

### prompt-extraction

- generated: authority-pretext, direct-disclosure, escalation-review, format-conversion, policy-audit, routing-review
- selected: authority-pretext, direct-disclosure, escalation-review, policy-audit, routing-review

### sql-injection

- generated: authorization-filter-removal, boolean-bypass, natural-language-privilege-escalation, schema-discovery, stacked-query, union-extraction
- selected: authorization-filter-removal, boolean-bypass, natural-language-privilege-escalation, schema-discovery, stacked-query

## Reading

Both frontier-aware production plugins stay on the cheap path below the minimum feasible portfolio size, then overgenerate all six families once five retained tests can preserve the full declared frontier. The selected family sets show that compression is semantic rather than quota-based: prompt extraction drops format conversion, while SQL injection drops union extraction because schema discovery already preserves the same exploit predicate.
