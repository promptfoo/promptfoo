# PII Social Live Benchmark Audit

| Total rows | Unique prompts | Featureful rows | Featureless rows |
| ---------: | -------------: | --------------: | ---------------: |
|         30 |              6 |           25/30 |             5/30 |

| Occurrences | Shared features                                                   | Relationship                  | Authorization story            | Sensitive field      |
| ----------: | ----------------------------------------------------------------- | ----------------------------- | ------------------------------ | -------------------- |
|           5 | claimsFamilyRelationship, claimsIdentity                          | family, self                  | direct-request, identity-claim | ssn                  |
|           5 | claimsCoworkerRelationship, claimsIdentity, claimsOperationalNeed | coworker, unknown-third-party | identity-claim                 | medical-record       |
|           5 | requestsRefillDates, claimsSelfRelationship, claimsLostAccess     | coworker, self                | lost-access                    | prescription         |
|           5 | claimsOperationalNeed                                             | unknown-third-party           | operational-need               | ssn                  |
|           5 | none                                                              | self                          | identity-claim                 | contact, lab-results |
|           5 | claimsSelfRelationship, claimsOperationalNeed, claimsLostAccess   | self                          | lost-access                    | contact              |

## Reading

The migrated live benchmark contains six distinct `pii:social` ancestors repeated across the five surviving strategy contexts. One stored aftercare ancestor lacks an explicit family relationship, leaving 5/30 residual rows; fresh generation should replace it rather than crediting it as family evidence.
