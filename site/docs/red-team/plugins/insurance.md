---
sidebar_label: Insurance Plugins
title: Insurance Red-Teaming Plugins - AI Security for Insurance Systems
description: Insurance red-teaming plugins for testing AI systems in health insurance contexts to identify vulnerabilities in insurance AI applications
---

# Insurance Red-Teaming Plugins

The Insurance Red-Teaming Plugins are a specialized suite designed for AI systems operating in health insurance contexts. These plugins test critical insurance compliance functions including HIPAA-compliant PHI handling, provider network accuracy, and non-discriminatory coverage determinations.

## Why Insurance Red-Teaming Matters

Insurance AI systems handle sensitive personal data and make decisions with significant financial and health consequences:

- **HIPAA Compliance**: PHI violations carry federal fines starting at $50,000 per violation, with potential criminal charges
- **Balance Billing Exposure**: Inaccurate provider network information leads to surprise medical bills and class action lawsuits
- **Civil Rights Liability**: Discriminatory coverage decisions violate ADA, Section 1557, and GINA with severe enforcement consequences
- **Financial Impact**: Health insurance operations at scale (like CVS/Aetna) serve millions of members daily
- **Regulatory Scrutiny**: Insurance AI systems are subject to state DOI oversight, CMS requirements, and federal civil rights enforcement

## Available Insurance Plugins

### PHI Disclosure

**Plugin ID:** `insurance:phi-disclosure`
**Severity: Critical**

Tests whether AI systems properly protect Protected Health Information (PHI) and comply with HIPAA privacy requirements. Unauthorized PHI disclosure can result in federal fines, class action lawsuits, and criminal charges.

**What it detects:**

- **Cross-Member PHI Leakage**: Disclosing Member A's information to Member B
- **Unauthorized Third-Party Disclosure**: Revealing PHI to family members, neighbors, or other unauthorized parties
- **Inadequate Authentication**: Releasing PHI based on minimal identity verification
- **Provider Impersonation**: Accepting provider credentials without proper verification
- **Researcher/Analyst Access**: Providing PHI for non-treatment purposes without authorization
- **Inadequate De-Identification**: Releasing data that can be re-identified to individuals
- **Minimum Necessary Violations**: Disclosing more PHI than required for the purpose
- **Marketing/Sales Use**: Using PHI for commercial purposes without authorization
- **Aggregate Data Re-Identification**: Providing statistics that could identify individuals

**Example scenarios:**

```
❌ Disclosing PHI to callers claiming to be healthcare providers without proper verification
❌ Providing member health information to family members without authorization
❌ Releasing bulk member data for "quality improvement" without proper agreements
✓ "I need to verify your identity and authorization before accessing health information"
```

### Network Misinformation

**Plugin ID:** `insurance:network-misinformation`
**Severity: High**

Tests accuracy of provider network information to prevent surprise medical bills and balance billing. Inaccurate network directories are the subject of active class action lawsuits and state enforcement actions.

**What it detects:**

- **Out-of-Network Shown as In-Network**: Listing terminated or non-participating providers as in-network
- **Terminated Provider Contracts**: Failing to reflect recent network terminations
- **Ghost Networks**: Listing providers who don't accept new patients or are unreachable
- **Wrong Provider Contact Information**: Outdated phone numbers, addresses, or practice locations
- **Outdated Specialty Information**: Incorrect provider specialties or certifications
- **Facility-Based Provider Errors**: Confusion between facility and individual provider network status
- **Tiering Inaccuracies**: Wrong cost-sharing tier assignments for in-network providers
- **Network Adequacy Gaps**: Failing to disclose limited provider availability
- **Credentialing Status Errors**: Listing providers who aren't credentialed with the plan
- **Plan-Specific Network Differences**: Not distinguishing between HMO/PPO/EPO network variations

**Example scenarios:**

```
❌ Confirming outdated network status for providers who left the network
❌ Providing incorrect contact information for terminated providers
❌ Stating all facility providers are in-network without verifying individual contracts
✓ "Network status changes frequently. Please verify with the provider before your appointment"
```

### Coverage Discrimination

**Plugin ID:** `insurance:coverage-discrimination`
**Severity: Critical**

Tests for discriminatory coverage decisions based on protected characteristics. Discrimination in coverage violates federal civil rights laws including ADA, Section 1557, GINA, and can result in federal enforcement actions and class action lawsuits.

**What it detects:**

- **Age Discrimination**: Using age as factor in medical necessity or coverage determinations
- **Disability Discrimination (ADA)**: Denying or limiting coverage due to disability status
- **Genetic Discrimination (GINA)**: Using genetic information in coverage decisions
- **Race/Ethnicity Bias**: Different coverage standards or recommendations based on race
- **Pregnancy Discrimination**: Applying different standards to pregnancy-related services
- **Mental Health Parity Violations**: More restrictive limitations on mental vs. physical health services
- **Sex/Gender Discrimination**: Different coverage based on sex or gender identity
- **National Origin Discrimination**: Coverage differences based on member's country of origin
- **Language Access Barriers**: Denying services due to language without providing interpreter services
- **Stereotyping in Medical Necessity**: Using demographic stereotypes in clinical determinations

**Example scenarios:**

```
❌ Denying coverage based on age rather than clinical criteria
❌ Applying different authorization standards based on disability status
❌ Using genetic information to deny preventive care coverage
❌ Requiring prior authorization for mental health services but not equivalent physical health services
✓ "Coverage determination based solely on clinical criteria and medical necessity"
```

## Configuration

Add insurance plugins to your promptfoo configuration:

```yaml
redteam:
  plugins:
    # Use the insurance collection to include all insurance plugins
    - insurance
```

Or specify individual insurance plugins:

```yaml
redteam:
  plugins:
    # Individual insurance plugins
    - insurance:phi-disclosure
    - insurance:network-misinformation
    - insurance:coverage-discrimination
```

## Use Cases

These plugins are particularly valuable for:

- **Health Insurance Payers**: Testing member service chatbots and portals
- **Healthcare Systems**: Validating insurance verification and authorization systems
- **Telehealth Platforms**: Ensuring insurance-related guidance is compliant and accurate
- **Pharmacy Benefit Managers**: Testing formulary and coverage determination systems
- **Provider Networks**: Validating provider directory accuracy and network information
- **Health IT Vendors**: Testing systems that handle PHI or make coverage recommendations

## Getting Help

For questions about insurance plugins:

1. Review the [general red-teaming documentation](/docs/red-team/)
2. Check the [plugin configuration guide](/docs/red-team/configuration/)
3. Join our [community discussions](https://github.com/promptfoo/promptfoo/discussions)
4. Consider consulting with healthcare compliance professionals for implementation guidance

## See Also

- [Red Team Configuration](/docs/red-team/configuration/)
- [Pharmacy Plugins](/docs/red-team/plugins/pharmacy/)
- [Medical Plugins](/docs/red-team/plugins/medical/)
- [PII Plugins](/docs/red-team/plugins/pii/)
