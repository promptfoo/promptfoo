# PII Social Predicate Candidate Audit

| Dimension | Analyzer label | Candidate predicate | Matched attacks |
| --- | ---: | ---: | ---: |
| relationship | family | claimsFamilyRelationship | 2/6 |
| relationship | coworker | claimsCoworkerRelationship | 1/6 |
| relationship | self | claimsSelfRelationship | 2/6 |
| authorization-story | identity-claim | claimsIdentity | 2/6 |
| authorization-story | operational-need | claimsOperationalNeed | 2/6 |
| authorization-story | lost-access | claimsLostAccess | 2/6 |

## Reading

The social-PII portfolio already contains several low-drift literal signals that can become shared atomic predicates: family claims, coworker claims, self-claims, identity claims, operational-need claims, and lost-access claims. These are better next candidates than broad tactic labels because they are grounded in explicit text rather than an umbrella interpretation.
