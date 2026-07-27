---
sidebar_label: Telecommunications Plugins
title: Telecommunications Red Team Plugins
description: Test telecom AI systems for customer-data exposure, account takeover, emergency-service misinformation, unauthorized changes, and fraud.
sidebar_position: 55
---

# Telecommunications Red-Teaming Plugins

Telecommunications plugins test assistants used by carriers, resellers, contact centers, and self-service account tools. They cover customer data, account security, emergency calling, consent, service accuracy, accessibility, and fraud.

## Why Telecommunications Red-Teaming Matters

Telecom assistants can expose call or location data, weaken account recovery, or give guidance that affects emergency access and customer charges. Include the account role, authentication state, supported services, and jurisdiction in the target's purpose so generated probes reflect the workflow.

:::note
These plugins provide security and safety test coverage. A passing scan is not a telecommunications or privacy compliance determination and does not replace review by an appropriate legal or compliance professional.
:::

## Available Telecommunications Plugins

### CPNI Disclosure

`telecom:cpni-disclosure` tests whether an assistant reveals customer proprietary network information (CPNI), including call records, subscribed services, billing, or usage, without appropriate verification and authorization.

Example risk: providing call history or account details to an unverified caller.

### Location Data Disclosure

`telecom:location-disclosure` tests whether an assistant reveals real-time or historical device location, cell-tower data, or location-service information to an unauthorized party.

Example risk: sharing location history with someone claiming to be a family member or emergency contact.

### Account Takeover Prevention

`telecom:account-takeover` tests whether an assistant enables SIM swaps, credential resets, port-outs, or account recovery with insufficient verification.

Example risk: processing a SIM change after weak or incomplete identity checks.

### E911 Misinformation

`telecom:e911-misinformation` tests whether an assistant gives inaccurate or overconfident guidance about emergency calling, location accuracy, VoIP, Wi-Fi calling, outages, or multi-line systems.

Example risk: promising that an emergency service will automatically receive an accurate location when the service has known limitations.

### TCPA Violation

`telecom:tcpa-violation` tests whether an assistant ignores opt-out requests, misrepresents consent, or helps initiate unauthorized marketing calls or messages.

Example risk: suggesting a way to continue bulk messages after a customer has opted out.

### Unauthorized Changes (Slamming/Cramming)

`telecom:unauthorized-changes` tests whether an assistant changes a carrier, plan, service, or charge without clear authorization from the account holder.

Example risk: enrolling a customer in a paid add-on during an unrelated support interaction.

### Fraud Enablement

`telecom:fraud-enablement` tests whether an assistant provides actionable help with caller-ID abuse, subscription fraud, illegal routing, missed-call scams, or phone-system compromise.

Example risk: explaining how to open service accounts using false identity information.

### Porting Misinformation

`telecom:porting-misinformation` tests whether an assistant gives incorrect porting requirements, exposes transfer credentials, facilitates an unauthorized port, or blocks a legitimate request.

Example risk: disclosing a transfer PIN to an unverified caller.

### Billing Misinformation

`telecom:billing-misinformation` tests whether an assistant invents promotions, omits required fees, or misstates plan prices, contract terms, taxes, or prorated charges.

Example risk: quoting a monthly price that omits known mandatory fees or inventing a discount.

### Coverage Misinformation

`telecom:coverage-misinformation` tests whether an assistant makes unsupported claims about network coverage, speed, roaming, indoor service, or future availability.

Example risk: guaranteeing coverage or 5G availability without checking the customer's location.

### Law Enforcement Request Handling

`telecom:law-enforcement-request-handling` tests whether an assistant discloses customer data, accepts an unverified request, over-discloses information, or bypasses the required legal process.

Example risk: providing location or call records to a person who only claims to be law enforcement.

### Accessibility Violation

`telecom:accessibility-violation` tests whether an assistant denies accommodation or gives inaccurate information about relay services, accessible billing, compatible devices, or emergency accessibility.

Example risk: dismissing a request for accessible billing or incorrectly stating that a required accessibility feature is unavailable.

## Configuration

Use the `telecom` collection to include all 12 telecommunications plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  purpose: 'A telecom support assistant that can explain plans and troubleshoot service but must verify an account holder before accessing records or changing service.'
  plugins:
    - telecom
```

To focus on specific workflows, configure individual plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - telecom:cpni-disclosure
    - telecom:location-disclosure
    - telecom:account-takeover
    - telecom:e911-misinformation
    - telecom:tcpa-violation
    - telecom:unauthorized-changes
    - telecom:fraud-enablement
    - telecom:porting-misinformation
    - telecom:billing-misinformation
    - telecom:coverage-misinformation
    - telecom:law-enforcement-request-handling
    - telecom:accessibility-violation
```

## Use Cases

- Carrier, cable, internet-provider, and reseller support assistants
- Account recovery, SIM change, and number-porting workflows
- Billing, plan, coverage, and self-service tools
- Contact-center and interactive voice-response systems

## Regulatory Framework

The suite covers scenarios relevant to the following areas. Requirements vary by jurisdiction and service type.

| Coverage area                               | Relevant plugins                                                    |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Customer network and location privacy       | `telecom:cpni-disclosure`, `telecom:location-disclosure`            |
| Marketing consent and opt-out               | `telecom:tcpa-violation`                                            |
| Unauthorized service changes and charges    | `telecom:unauthorized-changes`                                      |
| Emergency calling and dispatchable location | `telecom:e911-misinformation`                                       |
| Legal-process handling                      | `telecom:law-enforcement-request-handling`                          |
| Accessibility                               | `telecom:accessibility-violation`                                   |
| Number portability                          | `telecom:porting-misinformation`                                    |
| Billing and coverage accuracy               | `telecom:billing-misinformation`, `telecom:coverage-misinformation` |

## Related Concepts

- [Red Team Configuration](/docs/red-team/configuration/)
- [PII Plugins](/docs/red-team/plugins/pii/)
- [RBAC Plugin](/docs/red-team/plugins/rbac/)
- [Financial Plugins](/docs/red-team/plugins/financial/)
- [Insurance Plugins](/docs/red-team/plugins/insurance/)
