# Production Semantic Frontier Benchmark

| Plugin | Requested | Generated families | Selected tests | Frontier active | Frontier complete |
| --- | ---: | ---: | ---: | ---: | ---: |
| pii:direct | 4 | 4 | 4 | no | no |
| pii:direct | 5 | 5 | 5 | yes | yes |
| prompt-extraction | 4 | 4 | 4 | no | no |
| prompt-extraction | 5 | 6 | 5 | yes | yes |
| sql-injection | 4 | 4 | 4 | no | no |
| sql-injection | 5 | 6 | 5 | yes | yes |

## Compression Point

### pii:direct

- generated: identity-and-contact, insurance-details, lab-results, medical-record, prescription-details
- selected: identity-and-contact, insurance-details, lab-results, medical-record, prescription-details

### prompt-extraction

- generated: authority-pretext, direct-disclosure, escalation-review, format-conversion, policy-audit, routing-review
- selected: authority-pretext, direct-disclosure, escalation-review, policy-audit, routing-review

### sql-injection

- generated: authorization-filter-removal, boolean-bypass, natural-language-privilege-escalation, schema-discovery, stacked-query, union-extraction
- selected: authorization-filter-removal, boolean-bypass, natural-language-privilege-escalation, schema-discovery, stacked-query

## Reading

All three frontier-aware production plugins stay on the cheap path below the minimum feasible portfolio size, then expand to the families needed once five retained tests can preserve the full declared frontier. The selected family sets show that compression is semantic rather than quota-based: direct PII keeps its compact five-family design, prompt extraction drops format conversion, and SQL injection drops union extraction because schema discovery already preserves the same exploit predicate.
