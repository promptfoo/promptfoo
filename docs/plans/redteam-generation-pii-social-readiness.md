# PII Social Frontier Readiness

| Observed shared features | Shared predicate vocabulary | Shared dimensions | Separate-concept dimensions | Observed shared coverage |                 Recommendation |
| ------------------------ | --------------------------: | ----------------: | --------------------------: | -----------------------: | -----------------------------: |
| 7                        |                           8 |                 1 |                           3 |                      7/8 | expand shared vocabulary first |

## Details

- shared feature ids: claimsFamilyRelationship, claimsIdentity, claimsCoworkerRelationship, claimsOperationalNeed, requestsRefillDates, claimsSelfRelationship, claimsLostAccess
- separate-concept dimensions: authorization-story, relationship, tactic

## Reading

`pii:social` is still not production-ready, but it is no longer almost blank: the shared layer now exposes eight predicates and the current research portfolio exercises seven of them. The remaining gap is semantic rather than lexical: sensitive-field has a coarse rollup, while tactic, relationship, and authorization-story still lack complete analyzer-aligned mappings because `unknown-third-party` and `direct-request` remain default states without equally clean positive predicates.
