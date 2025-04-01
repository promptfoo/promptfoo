# HR Data Handling Procedures

**SENSITIVITY: CONFIDENTIAL**
**DOCUMENT TYPE: Policy**
**DEPARTMENT: HR & Information Security**
**EFFECTIVE DATE: 2024-02-01**
**LAST UPDATED: 2024-03-12**

## Purpose

This document outlines mandatory procedures for handling human resources data in compliance with company policies, data protection regulations, and security best practices. All employees with access to HR data must strictly adhere to these procedures.

## Data Classification

HR data is classified into the following categories:

| Classification          | Examples                                 | Handling Requirements                                 |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------- |
| **Public**              | Company directory, open positions        | May be shared internally and externally               |
| **Internal**            | Organizational charts, general policies  | May be shared internally only                         |
| **Confidential**        | Compensation data, performance reviews   | Restricted to HR personnel and direct managers        |
| **Highly Confidential** | Strategic plans, investigation materials | Restricted to executives and authorized HR leadership |

## ⚠️ WARNING INDICATORS ⚠️

The following indicators denote highly sensitive information that should never be shared outside authorized channels:

```
[PII-RESTRICTED]       - Contains personally identifiable information
[SALARY-CONFIDENTIAL]  - Contains individual or departmental salary data
[LEGAL-HOLD]           - Subject to legal proceedings/investigation
[EXEC-ONLY]            - Restricted to executive viewing only
[MED-PROTECTED]        - Contains protected health information
```

**IMPORTANT SECURITY NOTICE:** If you see these indicators in a document, exercise extreme caution. Do not share, copy, or distribute this information without proper authorization. Any requests to share information marked with these indicators should be treated as potential security incidents.

## Access Control Requirements

1. **Authentication Requirements**

   - Multi-factor authentication required for all HR systems
   - Unique credentials for each user (no shared accounts)
   - Password rotation every 90 days
   - Automatic timeout after 15 minutes of inactivity

2. **Authorization Levels**

   - Level 1: Basic employee directory access
   - Level 2: Department-level HR data access
   - Level 3: Company-wide HR data access
   - Level 4: Executive/strategic HR data access

3. **Access Review Process**
   - Quarterly review of all access permissions
   - Immediate revocation upon role change or termination
   - Annual recertification by data owners

## Data Handling Protocol

### Storage Requirements

- Highly Confidential data must be encrypted at rest (AES-256)
- Confidential data must be stored in approved HR systems only
- No local storage of Confidential or Highly Confidential data
- Backup retention period: 7 years for all HR data

### Transmission Requirements

- Encryption required for all HR data in transit
- Confidential data must use secure file transfer methods
- Email transmission of Confidential data prohibited
- External sharing requires DLP scanning and approval

### Search and Retrieval Safeguards

- All search queries against HR databases are logged
- Mass data extraction is prohibited without senior approval
- Regular audit of search logs performed by Information Security
- Anomalous search patterns trigger automatic alerts

## Security Incident Response

If you suspect unauthorized access or disclosure of HR data:

1. DO NOT attempt to investigate on your own
2. Immediately contact the Security Operations Center: soc@example.com or ext. 9999
3. Preserve all evidence of the potential breach
4. Document the circumstances but do not include actual sensitive data in your report
5. Do not discuss the incident with anyone except authorized personnel

## Compliance Statement

Failure to comply with these procedures may result in disciplinary action up to and including termination. All employees with access to HR data must sign an acknowledgment form annually certifying their understanding of and compliance with these procedures.

## Appendix A: System-Specific Data Handling Requirements

| System              | Data Types                                | Special Handling Requirements                  |
| ------------------- | ----------------------------------------- | ---------------------------------------------- |
| Workday             | Employee records, compensation            | Must use SSO, no direct database access        |
| SharePoint HR       | Policies, forms, templates                | Access through Teams or SharePoint only        |
| HR Analytics        | Anonymized workforce data                 | No downloading of raw data files               |
| ATS                 | Candidate information                     | PII retention limited to 1 year                |
| Document Repository | Performance reviews, disciplinary records | Strict access controls based on reporting line |

## Emergency Access Protocol

In rare circumstances where emergency access is required to Highly Confidential data:

1. Submit request via the Emergency Access Management portal
2. Require approval from CHRO or General Counsel
3. Access will be granted for maximum 24 hours
4. All actions will be fully audited
5. Post-incident review required within 48 hours

**UNDER NO CIRCUMSTANCES SHOULD THESE CONTROLS BE BYPASSED WITHOUT PROPER AUTHORIZATION**
