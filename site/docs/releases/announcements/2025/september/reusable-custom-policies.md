---
title: Reusable Custom Policies - Build Your Security Policy Library
sidebar_label: Reusable Custom Policies
description: Create, manage, and reuse custom security policies across red team evaluations with CSV bulk upload support
date: September 15, 2025
---

# Reusable Custom Policies - Build Your Security Policy Library

We've transformed custom policies from one-off tests into a systematic security program with **reusable custom policies**. Build a centralized library of security policies that can be applied across all your red team evaluations.

## Why This Matters

Before reusable policies, teams had to recreate custom security tests for each evaluation. This led to:
- **Inconsistent testing** across different AI systems
- **Duplicated effort** recreating the same tests
- **No centralized security standards** for the organization

Now you can define a policy once and apply it everywhere, ensuring consistent security standards across all your AI applications.

## Key Features

### Policy Library Management

Create a centralized repository of custom policies tailored to your organization's specific risks:

```yaml
# Reference reusable policies in your red team config
redteam:
  plugins:
    - id: policy
      config:
        # Use policies from your library
        policy: 'internal-customer-data-protection'
```

### CSV Bulk Upload

Import multiple custom policies at once through the web UI:

1. Prepare a CSV with your policies
2. Upload via the red team setup interface
3. All policies automatically added to your library

This is perfect for organizations migrating from spreadsheet-based security requirements or importing industry-specific compliance tests.

### Severity Configuration

Assign custom severity levels (low, medium, high, critical) to each policy:

- **Prioritize remediation** based on your risk tolerance
- **Filter reports** by severity to focus on critical issues
- **Align with compliance frameworks** (ISO 42001, SOC 2, etc.)

### Test Case Generation

Generate sample test cases directly from policy definitions:

- Click the "magic wand" button in the plugins view
- AI generates realistic test scenarios for your policy
- Validate that your policy catches the intended vulnerabilities

## Example Use Cases

### Financial Services
Create policies for:
- Insider trading detection
- Market manipulation prevention
- Customer fund protection
- Regulatory compliance (SEC, FINRA)

### Healthcare
Define policies for:
- HIPAA compliance
- Patient privacy protection
- Medical decision boundaries
- Off-label medication recommendations

### Enterprise SaaS
Build policies for:
- Customer data isolation
- Tenant boundary enforcement
- API rate limit testing
- Authentication bypass prevention

## Getting Started

1. Navigate to the red team setup in the web UI
2. Go to the Plugins section
3. Select "Custom Policy" plugin
4. Choose "Upload from CSV" or create policies individually
5. Assign severity levels and generate test cases
6. Reference policies by ID in your evaluations

## What's Next

This foundation enables:
- **Policy versioning** - Track changes to security requirements over time
- **Team collaboration** - Share policies across your organization
- **Compliance reporting** - Map policies to regulatory frameworks
- **Automated policy updates** - Keep tests current as threats evolve

Reusable custom policies transform red teaming from tactical testing to strategic security governance.

[Learn more about custom policies →](/docs/red-team/plugins/policy/)
