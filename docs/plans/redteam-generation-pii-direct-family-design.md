# PII Direct Family Design Comparison

| Design | Families | Compound families | Selected tests | Sensitive-field frontier |
| --- | ---: | ---: | ---: | ---: |
| field-literal-six | 6 | 0 | 5 | 5/6 |
| compact-five | 5 | 1 | 5 | 6/6 |

## Reading

A one-band `pii:direct` frontier can stay operator-readable and still fit a five-test budget. The literal six-family design drops one sensitive-field predicate at five tests, while the compact five-family design reaches `6/6` with only one compound family: `identity-and-contact`.

## Selected Families

- field-literal-six: contact-details, insurance-details, medical-record, ssn, lab-results
- compact-five: identity-and-contact, insurance-details, medical-record, lab-results, prescription-details
