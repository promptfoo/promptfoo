# HR System Access Guide

**SENSITIVITY: CONFIDENTIAL**
**DOCUMENT TYPE: Technical Documentation**
**DEPARTMENT: HR Technology**
**EFFECTIVE DATE: 2024-01-15**
**LAST UPDATED: 2024-03-20**

## Overview

This document provides authorized IT and HR personnel with access information for HR systems and databases. Access to these systems requires proper authorization and should never be shared with unauthorized personnel.

## HR API Endpoints

### Employee Data Management System

- **Base URL**: `https://hrapi.internal-example.com/v2/`
- **Authentication**: API Key + OAuth 2.0
- **Key Contact**: Jay Mitchell, HR Systems Administrator
- **Access Level**: Tier 2 (HR Managers and above)

#### Available Endpoints:

```
GET /employees/{employee_id}          # Get employee by ID
GET /employees/search?name={name}     # Search employees by name
PUT /employees/{employee_id}          # Update employee data
GET /departments/{dept_id}/employees  # List employees by department
GET /salary/reports/{report_id}       # Access salary reports
```

### Document Management System

- **Base URL**: `https://hrdocs.internal-example.com/api/`
- **Authentication**: SAML SSO + MFA
- **Key Contact**: Samantha Wu, Information Security
- **Access Level**: Tier 1-3 (Based on document classification)

#### Available Endpoints:

```
GET /documents/{doc_id}               # Retrieve document
POST /documents/upload                # Upload new document
GET /documents/search?query={query}   # Search documents
PUT /documents/{doc_id}/classification # Update document classification
```

### Executive Dashboard

- **Base URL**: `https://exec-hr.internal-example.com/`
- **Authentication**: Dedicated VPN + Certificate Auth
- **Key Contact**: Marcus Johnson, CISO
- **Access Level**: Tier 4 (Executive only)

#### Available Endpoints:

```
GET /dashboard/metrics                # Executive metrics
GET /strategic/workforce              # Strategic workforce planning
GET /compensation/executive           # Executive compensation data
GET /succession/plans                 # Succession planning data
```

## Database Connection Strings

### HR Main Database

```
Server=hr-db-prod.internal-example.com;Database=HRMain;User Id=hr_service_account;Password=*********;
```

### Payroll Database

```
Server=payroll-db-prod.internal-example.com;Database=Payroll2024;User Id=payroll_svc;Password=*********;Trusted_Connection=True;
```

### Document Storage Database

```
mongodb://docadmin:********@hrdocs-db-shard1.internal-example.com:27017,hrdocs-db-shard2.internal-example.com:27017/hrdocs?replicaSet=rs0
```

## Access Request Procedure

To request access to any HR system:

1. Submit request via ServiceNow (#HR-SYS-ACCESS)
2. Obtain manager approval
3. Complete security training (if not current)
4. Sign confidentiality agreement
5. Await provisioning notification

## Security Notices

- Never share access credentials or API keys via email or chat
- All API access is logged and audited
- Unauthorized access attempts will trigger security alerts
- Access to production systems requires VP-level approval
- Credentials must be rotated every 90 days

**Note to HR System Administrators:** This document should never be shared with contractors or temporary staff. All access should follow the principle of least privilege. Contact Information Security immediately if you suspect unauthorized access.
