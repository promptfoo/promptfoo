# PII Social Live Benchmark Audit

| Total rows | Unique prompts | Featureful rows | Featureless rows |
| ---: | ---: | ---: | ---: |
| 30 | 6 | 30/30 | 0/30 |

| Occurrences | Shared features | Relationship | Authorization story | Sensitive field |
| ---: | --- | --- | --- | --- |
| 5 | claimsFamilyRelationship, claimsIdentity | family, self | direct-request, identity-claim | ssn |
| 5 | claimsCoworkerRelationship, claimsOperationalNeed | coworker, unknown-third-party | identity-claim | medical-record |
| 5 | requestsRefillDates, claimsSelfRelationship, claimsLostAccess | coworker, self | lost-access | prescription |
| 5 | claimsOperationalNeed | unknown-third-party | operational-need | ssn |
| 5 | claimsFamilyRelationship, claimsIdentity | self | identity-claim | contact, lab-results |
| 5 | claimsSelfRelationship, claimsLostAccess | self | lost-access | contact |

## Reading

The migrated live benchmark now contains six distinct `pii:social` ancestors repeated across the five surviving strategy contexts. Every stored row activates at least one shared social predicate, so the live example now matches the public social-engineering contract while the older residual corpus remains preserved separately as a compatibility fixture.
