---
sidebar_label: Insurance Plugins
title: Insurance Red-Teaming Plugins - AI Security for Insurance Systems
description: Insurance red-teaming plugins for testing AI systems across health, property, auto, life, and commercial insurance contexts
---

# Insurance Red-Teaming Plugins

The Insurance Red-Teaming Plugins are a specialized suite designed for AI systems operating in insurance contexts including health, property, auto, life, and general/commercial insurance. These plugins test critical insurance compliance functions including PHI handling, policyholder data protection, provider and vendor network accuracy, and non-discriminatory coverage determinations.

Coverage Discrimination and Network Misinformation plugins work across all insurance types. PHI Disclosure is healthcare-specific and focuses on patient data privacy rules. Data Disclosure covers non-health policyholder data protection under GLBA, FCRA, and DPPA.

## Why Insurance Red-Teaming Matters

Insurance AI systems handle sensitive personal data and make decisions with significant financial and health consequences:

- **PHI/Privacy Exposure**: Health data privacy violations can trigger federal fines, lawsuits, and enforcement actions
- **GLBA/State Privacy**: Policyholder data violations result in regulatory fines and enforcement actions from state insurance departments
- **Balance Billing Exposure**: Inaccurate provider network information leads to surprise medical bills and class action lawsuits
- **Vendor Network Errors**: Incorrect contractor or repair shop listings void warranties and expose policyholders to unexpected costs
- **Civil Rights Liability**: Discriminatory coverage decisions violate ADA, Section 1557, GINA, Fair Housing Act, and ECOA with severe enforcement consequences
- **Financial Impact**: Insurance operations at scale serve millions of policyholders daily
- **Regulatory Scrutiny**: Insurance AI systems are subject to state DOI oversight, CMS requirements, and federal civil rights enforcement

## Available Insurance Plugins

### PHI Disclosure

**Plugin ID:** `insurance:phi-disclosure`
**Severity: Critical**

Tests whether AI systems properly protect Protected Health Information (PHI) and satisfy health data privacy requirements. Unauthorized PHI disclosure can result in federal fines, class action lawsuits, and criminal charges. This plugin is healthcare-specific.

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

### Data Disclosure

**Plugin ID:** `insurance:data-disclosure`
**Severity: Critical**

Tests whether AI systems properly protect non-health policyholder data under GLBA, state insurance privacy laws, FCRA, and DPPA. Covers claims history, property details, driving records, beneficiary information, and business data.

**What it detects:**

- **Cross-Policyholder Data Leakage**: Disclosing one policyholder's data to another
- **Claims History/CLUE Data Disclosure**: Revealing loss history to unauthorized parties (real estate agents, landlords, prospective buyers)
- **Property Security Detail Leakage**: Revealing security systems, vacancy status, or valuations
- **Driving Record/Telematics Disclosure**: Revealing driving behavior, location data, or accident details
- **Underwriting Data Disclosure**: Revealing medical exam results or financial statements from life insurance applications
- **Beneficiary Information Disclosure**: Revealing beneficiary names, relationships, or trust arrangements
- **Business/Commercial Data Disclosure**: Revealing coverage limits, loss runs, or financials to competitors
- **Agent/Adjuster Impersonation**: Releasing data to unverified agents or adjusters
- **Unauthorized Third-Party Disclosure**: Providing data to family, landlords, employers, or attorneys without authorization

**Example scenarios:**

```
❌ Providing property claims history to a real estate agent without policyholder authorization
❌ Disclosing driving records or telematics data to an attorney without proper legal process
❌ Revealing beneficiary information to a family member without power of attorney documentation
✓ "I need to verify your authorization before disclosing any policyholder information"
```

### Network Misinformation

**Plugin ID:** `insurance:network-misinformation`
**Severity: High**

Tests accuracy of provider and vendor network information to prevent surprise bills, voided warranties, and financial harm. Applies to medical provider networks, preferred repair contractors, auto body shops (DRP), financial advisors, and other approved vendors.

**What it detects:**

- **Out-of-Network Shown as In-Network**: Listing terminated or non-participating providers as in-network
- **Terminated Provider Contracts**: Failing to reflect recent network terminations
- **Ghost Networks**: Listing providers who don't accept new patients or are unreachable
- **Wrong Provider Contact Information**: Outdated phone numbers, addresses, or practice locations
- **Outdated Specialty Information**: Incorrect provider specialties or certifications
- **Facility-Based Provider Errors**: Confusion between facility and individual provider network status
- **Tiering Inaccuracies**: Wrong cost-sharing tier assignments for in-network providers
- **Network Adequacy Gaps**: Failing to disclose limited provider availability
- **Preferred Contractor Misrepresentation**: Listing contractors without current partnership agreements
- **Body Shop/DRP Errors**: Incorrect Direct Repair Program listings for auto policyholders
- **Vendor Capacity/Availability Errors**: Listing vendors without current capacity
- **Vendor Licensing/Certification Gaps**: Listing vendors without current licenses or bonding

**Example scenarios:**

```
❌ Confirming outdated network status for providers who left the network
❌ Directing a policyholder to a DRP body shop that no longer participates
❌ Listing a preferred contractor whose partnership agreement has ended
✓ "Network status changes frequently. Please verify with the provider before your appointment"
```

### Coverage Discrimination

**Plugin ID:** `insurance:coverage-discrimination`
**Severity: Critical**

Tests for discriminatory coverage, underwriting, and claims decisions based on protected characteristics. Applies across all insurance types. Discrimination violations include ADA, Section 1557, GINA, Fair Housing Act, ECOA, and state unfair trade practices acts.

**What it detects:**

- **Age Discrimination**: Using age as factor in medical necessity or coverage determinations
- **Disability Discrimination (ADA)**: Denying or limiting coverage due to disability status
- **Genetic Discrimination (GINA)**: Using genetic information in coverage decisions
- **Race/Ethnicity Bias**: Different coverage standards or recommendations based on race
- **Pregnancy Discrimination**: Applying different standards to pregnancy-related services
- **Mental Health Parity Violations**: More restrictive limitations on mental vs. physical health services
- **Sex/Gender Discrimination**: Different coverage based on sex or gender identity
- **Geographic/Neighborhood Redlining**: Denying coverage or pricing based on neighborhood demographics
- **Credit Score Proxy Discrimination**: Using credit-based insurance scores as racial proxies
- **Occupation/Industry Discrimination**: Underwriting bias based on occupation stereotypes
- **Marital/Domestic Status Discrimination**: Rate differences based on marital status
- **Claims History Retaliation**: Punitive actions after legitimate claims

**Example scenarios:**

```
❌ Denying coverage based on age rather than clinical criteria
❌ Pricing homeowner's insurance based on neighborhood racial composition
❌ Using credit scores that disproportionately impact minority communities without actuarial justification
❌ Non-renewing a policy in retaliation for filing legitimate claims
✓ "Coverage determination based solely on objective clinical or actuarial risk criteria"
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
    - insurance:data-disclosure
    - insurance:network-misinformation
    - insurance:coverage-discrimination
```

## Use Cases

These plugins are particularly valuable for:

- **Health Insurance Payers**: Testing member service chatbots and portals for PHI protection and coverage accuracy
- **Property Insurers**: Testing claims portals, contractor network accuracy, and data protection for property-specific data
- **Auto Insurers**: Testing claims systems, DRP network accuracy, telematics data protection, and rating fairness
- **Life Insurers**: Testing underwriting systems, beneficiary data protection, and genetic discrimination compliance
- **Commercial Insurers**: Testing business data protection, coverage limit confidentiality, and fair underwriting
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
4. Consider consulting with insurance compliance professionals for implementation guidance

## See Also

- [Red Team Configuration](/docs/red-team/configuration/)
- [Pharmacy Plugins](/docs/red-team/plugins/pharmacy/)
- [Medical Plugins](/docs/red-team/plugins/medical/)
- [PII Plugins](/docs/red-team/plugins/pii/)
