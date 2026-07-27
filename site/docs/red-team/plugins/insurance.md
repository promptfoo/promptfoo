---
sidebar_label: Insurance Plugins
title: Insurance Red-Teaming Plugins - AI Security for Insurance Systems
description: Test insurance AI systems for protected-data disclosure, inaccurate network information, and discriminatory coverage decisions.
---

# Insurance Red-Teaming Plugins

Insurance plugins test assistants used for health, property, auto, life, and commercial insurance. They cover protected health and policyholder data, provider or vendor networks, and fair access to coverage.

## Why Insurance Red-Teaming Matters

Insurance assistants often combine sensitive records with decisions that affect access, cost, and care. Test the user's role, policy type, authentication state, and jurisdiction so the suite can identify cross-member disclosure, inaccurate guidance, and differential treatment.

:::note
These plugins provide security and safety test coverage. A passing scan is not a determination of insurance, privacy, or civil-rights compliance and does not replace review by the appropriate compliance professional.
:::

## Available Insurance Plugins

### PHI Disclosure

`insurance:phi-disclosure` tests whether a health-insurance assistant reveals protected health information (PHI) across members, to unauthorized parties, or without sufficient authentication.

Example risk: disclosing another member's claims, diagnosis, or treatment information to a caller who has not been verified.

### Data Disclosure

`insurance:data-disclosure` tests for exposure of non-health policyholder data, including account, claim, payment, vehicle, property, and identity information.

Example risk: revealing a policyholder's claim history or payment details to another customer.

### Network Misinformation

`insurance:network-misinformation` tests whether an assistant gives inaccurate information about covered providers, repair or service networks, authorization requirements, or likely out-of-network cost.

Example risk: assuring a customer that an out-of-network provider or vendor is covered without checking the relevant plan.

### Coverage Discrimination

`insurance:coverage-discrimination` tests whether an assistant denies, limits, prices, or describes coverage differently on the basis of protected or prohibited characteristics.

Example risk: discouraging an eligible customer from coverage because of disability, family status, or another protected characteristic.

## Configuration

Use the `insurance` collection to include all four insurance plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  purpose: 'An insurance assistant that explains benefits and claim status after authentication but cannot disclose another member or policyholder record.'
  plugins:
    - insurance
```

To focus on specific workflows, configure individual plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - insurance:phi-disclosure
    - insurance:data-disclosure
    - insurance:network-misinformation
    - insurance:coverage-discrimination
```

## Use Cases

- Member and policyholder support assistants
- Claims, prior-authorization, and benefit-explanation workflows
- Provider, repair, or service-network search tools
- Underwriting, quoting, and coverage-eligibility assistants

## Related Concepts

- [Red Team Configuration](/docs/red-team/configuration/)
- [PII Plugins](/docs/red-team/plugins/pii/)
- [Medical Plugins](/docs/red-team/plugins/medical/)
- [Financial Plugins](/docs/red-team/plugins/financial/)
- [Bias Plugins](/docs/red-team/plugins/bias/)
