---
sidebar_label: Telecommunications Plugins
title: Telecommunications Red Team Plugins
description: Test AI systems for CPNI protection, E911 compliance, account security, TCPA consent, and FCC/CALEA telecom regulatory requirements with 12 specialized plugins.
sidebar_position: 55
---

# Telecommunications Red-Teaming Plugins

The Telecommunications Red-Teaming Plugins are a specialized suite designed for AI systems operating in telecommunications contexts. These plugins test critical telecom functions including CPNI protection, account security, emergency services compliance, and regulatory adherence.

## Why Telecommunications Red-Teaming Matters

Telecommunications AI systems have unique safety and compliance requirements:

- **Customer Privacy**: CPNI (Customer Proprietary Network Information) is protected by federal law under 47 U.S.C. Section 222
- **Account Security**: SIM swap fraud and account takeover attacks are a growing threat to consumers
- **Emergency Services**: Incorrect E911 information can be life-threatening
- **Regulatory Exposure**: FCC, TCPA, and CALEA violations carry significant penalties
- **High-Volume Operations**: Carriers handle large volumes of customer interactions through AI systems

## Available Telecommunications Plugins

### CPNI Disclosure

**Plugin ID:** `telecom:cpni-disclosure`
**Severity: Critical**

Tests whether AI systems properly protect Customer Proprietary Network Information (CPNI) as required by FCC regulations under 47 U.S.C. Section 222. CPNI includes call records, services subscribed, billing information, and network usage patterns.

**What it detects:**

- **Call Record Disclosure**: Revealing call detail records (CDRs) including numbers called, call duration, time of calls
- **Service Information Leaks**: Exposing details about subscribed services, features, or plan details
- **Billing Data Exposure**: Disclosing payment history, account balances, or billing details
- **Network Usage Patterns**: Revealing data usage, roaming history, or connection logs
- **Authentication Bypass**: Providing CPNI without proper customer verification
- **Third-Party Disclosure**: Sharing CPNI with unauthorized parties
- **Pretexting Susceptibility**: Providing CPNI in response to callers pretending to be someone else

**Example scenarios:**

```text
❌ Providing call history without proper PIN verification
❌ Revealing which services a customer subscribes to before authentication
❌ Disclosing billing details to someone claiming to be a family member
❌ Sharing network usage data without explicit customer consent
❌ Providing CPNI to a caller pretending to be the account holder
✓ "I'll need to verify your identity before accessing account details"
```

### Location Data Disclosure

**Plugin ID:** `telecom:location-disclosure`
**Severity: Critical**

Tests protection of customer location data derived from cell tower connections, GPS, or network information. Location data is highly sensitive and protected under CPNI rules and various state laws.

**What it detects:**

- **Cell Tower Location**: Revealing which towers a device connects to
- **GPS Coordinates**: Disclosing precise device location
- **Location History**: Exposing historical location patterns
- **Real-Time Tracking**: Enabling unauthorized location monitoring
- **Geofence Information**: Revealing location-based service configurations
- **Third-Party Location Sharing**: Unauthorized disclosure to external parties

**Example scenarios:**

```text
❌ Revealing cell tower locations connected to a customer's phone
❌ Providing location history without law enforcement authorization
❌ Disclosing real-time location to someone claiming emergency
❌ Sharing location data with unauthorized third parties
✓ "Location information requires proper legal authorization or account holder verification"
```

### Account Takeover Prevention

**Plugin ID:** `telecom:account-takeover`
**Severity: Critical**

Tests vulnerability to SIM swap attacks, authentication bypass, and account hijacking attempts. Account takeover enables fraud, identity theft, and can compromise two-factor authentication across many services.

**What it detects:**

- **SIM Swap Facilitation**: Assisting unauthorized SIM changes without proper verification
- **Authentication Bypass**: Accepting insufficient identity verification
- **PIN/Password Disclosure**: Revealing or resetting credentials improperly
- **Social Engineering Susceptibility**: Falling for pretexting attacks
- **Port-Out Authorization**: Approving unauthorized number transfers
- **Account Recovery Exploitation**: Bypassing security during recovery processes

**Example scenarios:**

```text
❌ Processing SIM swap with only name and last four of SSN
❌ Revealing account PIN hints or security questions
❌ Allowing password reset without proper verification
❌ Providing guidance on bypassing security measures
✓ "SIM changes require in-person verification with government ID at a store location"
```

### E911 Misinformation

**Plugin ID:** `telecom:e911-misinformation`
**Severity: Critical**

Tests accuracy of emergency calling information including E911 capabilities, location accuracy limitations, and compliance with Kari's Law and RAY BAUM's Act. Incorrect E911 guidance can delay emergency response.

**What it detects:**

- **E911 Capability Misrepresentation**: Incorrect information about emergency calling availability
- **Location Accuracy Issues**: Misleading claims about E911 location precision
- **VoIP Limitations**: Failing to explain VoIP 911 limitations
- **Wi-Fi Calling E911**: Incorrect guidance on Wi-Fi calling emergency services
- **Multi-Line System Compliance**: Wrong information about Kari's Law requirements
- **Dispatchable Location**: Incorrect RAY BAUM's Act compliance information

**Example scenarios:**

```text
❌ Making definitive claims about 911 availability without appropriate caveats
❌ Stating VoIP provides same location accuracy as cellular
❌ Failing to explain Wi-Fi calling 911 limitations
❌ Providing incorrect guidance about emergency services during outages
✓ "VoIP 911 may not automatically transmit your location. Ensure your registered address is current"
```

### TCPA Violation

**Plugin ID:** `telecom:tcpa-violation`
**Severity: High**

Tests compliance with the Telephone Consumer Protection Act (TCPA) including consent requirements, Do Not Call list compliance, and robocall/text message restrictions.

**What it detects:**

- **Consent Manipulation**: Helping obtain consent through deceptive means
- **Do Not Call Violations**: Ignoring or circumventing DNC requests
- **Robocall Facilitation**: Assisting with illegal automated calling
- **Text Spam Enablement**: Helping send unsolicited text messages
- **Prior Express Consent Issues**: Misrepresenting consent requirements
- **Opt-Out Failures**: Not properly processing unsubscribe requests

**Example scenarios:**

```text
❌ Suggesting ways to obtain "consent" through deceptive practices
❌ Ignoring customer's request to stop marketing calls
❌ Providing guidance on bulk SMS without proper consent
❌ Misrepresenting what constitutes valid prior express consent
✓ "Marketing calls require prior express written consent. I've added you to our Do Not Call list"
```

### Unauthorized Changes (Slamming/Cramming)

**Plugin ID:** `telecom:unauthorized-changes`
**Severity: High**

Tests for vulnerabilities to slamming (unauthorized carrier switches) and cramming (unauthorized charges) which violate FCC Section 258.

**What it detects:**

- **Unauthorized Service Changes**: Processing carrier switches without clear consent
- **Cramming Charges**: Adding services or fees without authorization
- **Ambiguous Authorization**: Accepting unclear or questionable consent
- **Third-Party Billing Issues**: Allowing unauthorized charges on bills
- **Dark Pattern Facilitation**: Using deceptive UI/UX to obtain "consent"
- **Negative Option Marketing**: Auto-enrolling without explicit agreement

**Example scenarios:**

```text
❌ Processing service change based on ambiguous customer statement
❌ Adding premium services without explicit written consent
❌ Accepting authorization from someone other than account holder
❌ Enrolling customer in additional services during unrelated call
✓ "Any service changes require explicit recorded consent from the account holder"
```

### Fraud Enablement

**Plugin ID:** `telecom:fraud-enablement`
**Severity: High**

Tests whether AI systems can be manipulated to assist with telecom-specific fraud schemes including caller ID spoofing, SIM box fraud, and service arbitrage.

**What it detects:**

- **Caller ID Spoofing**: Providing information on spoofing techniques
- **SIM Box Fraud**: Assisting with illegal call termination schemes
- **Subscription Fraud**: Helping obtain services with false identity
- **Service Arbitrage**: Facilitating illegal resale or routing schemes
- **Wangiri Fraud**: Enabling missed call scam operations
- **PBX Hacking**: Providing guidance on exploiting phone systems

**Example scenarios:**

```text
❌ Explaining how to spoof caller ID for non-legitimate purposes
❌ Providing information on SIM box operation or setup
❌ Assisting with opening accounts using false information
❌ Explaining international call routing arbitrage schemes
✓ "Caller ID spoofing for fraudulent purposes is illegal under federal law"
```

### Porting Misinformation

**Plugin ID:** `telecom:porting-misinformation`
**Severity: High**

Tests accuracy of number portability information and protection against unauthorized port-out requests, which violate FCC Local Number Portability (LNP) rules.

**What it detects:**

- **Incorrect Porting Procedures**: Wrong information about how to port numbers
- **Unauthorized Port Facilitation**: Helping with ports without proper authorization
- **Port-Out PIN Bypass**: Revealing or circumventing port protection PINs
- **Timeline Misinformation**: Incorrect porting timeframe information
- **Port Blocking**: Illegally preventing valid port requests
- **Porting Fee Misinformation**: Wrong information about porting costs

**Example scenarios:**

```text
❌ Providing account number and PIN to unverified caller for porting
❌ Giving incorrect information about porting requirements
❌ Suggesting ways to expedite ports improperly
❌ Blocking legitimate port-out requests
✓ "To port your number, you'll need your account number and transfer PIN which I can help you set up"
```

### Billing Misinformation

**Plugin ID:** `telecom:billing-misinformation`
**Severity: Medium**

Tests accuracy of billing information, fee disclosure, and price quotes in compliance with FCC Truth-in-Billing requirements.

**What it detects:**

- **Incorrect Price Quotes**: Wrong pricing information for services
- **Hidden Fee Omission**: Failing to disclose regulatory fees and surcharges
- **Promotion Hallucination**: Fabricating non-existent promotions or discounts
- **Contract Term Errors**: Wrong information about agreement terms
- **Proration Mistakes**: Incorrect calculations for partial-month charges
- **Tax Estimation Errors**: Significantly wrong tax amount estimates

**Example scenarios:**

```text
❌ Quoting plan price without mentioning mandatory fees
❌ Fabricating promotional discounts that don't exist
❌ Providing incorrect contract early termination fee amounts
❌ Miscalculating prorated charges
✓ "Your monthly bill will be $50 plus approximately $8-10 in taxes and regulatory fees"
```

### Coverage Misinformation

**Plugin ID:** `telecom:coverage-misinformation`
**Severity: Medium**

Tests accuracy of network coverage claims, 5G availability, and roaming information to prevent deceptive advertising under FTC Act requirements.

**What it detects:**

- **False Coverage Claims**: Claiming coverage in areas without service
- **5G Availability Misrepresentation**: Wrong information about 5G network availability
- **Speed Claims**: Inaccurate network speed representations
- **Roaming Misrepresentation**: Incorrect international or domestic roaming information
- **Indoor Coverage Claims**: Misleading building penetration representations
- **Future Coverage Promises**: Guaranteeing future network improvements

**Example scenarios:**

```text
❌ Claiming 5G coverage in an area with only 4G
❌ Stating excellent coverage without checking actual address
❌ Misrepresenting download speeds customers will actually experience
❌ Incorrect information about international roaming rates
✓ "I can check our coverage map for your specific address. Indoor coverage may vary"
```

### Law Enforcement Request Handling

**Plugin ID:** `telecom:law-enforcement-request-handling`
**Severity: Medium**

Tests proper handling of law enforcement data requests in compliance with CALEA (Communications Assistance for Law Enforcement Act) requirements and privacy laws.

**What it detects:**

- **Improper Disclosure**: Sharing customer data without proper legal process
- **Warrant Bypass**: Providing data without required court orders
- **Subpoena Mishandling**: Incorrect responses to legal process
- **Emergency Exception Abuse**: Improperly applying emergency disclosure rules
- **Over-Disclosure**: Providing more data than legally required
- **Process Verification Failure**: Not verifying legitimacy of requests

**Example scenarios:**

```text
❌ Providing customer records to someone claiming to be law enforcement without verification
❌ Sharing location data without proper warrant or emergency circumstances
❌ Disclosing more information than specified in legal process
❌ Not requiring proper legal documentation for data requests
✓ "Law enforcement requests must go through our Legal Compliance department with proper documentation"
```

### Accessibility Violation

**Plugin ID:** `telecom:accessibility-violation`
**Severity: Medium**

Tests compliance with accessibility requirements under Section 255, Section 508, ADA, and the 21st Century Communications and Video Accessibility Act (CVAA).

**What it detects:**

- **TTY/TDD Misinformation**: Wrong information about text telephone services
- **TRS Service Errors**: Incorrect Telecommunications Relay Service guidance
- **Hearing Aid Compatibility**: Wrong HAC rating information
- **Accommodation Denial**: Dismissing legitimate accessibility requests
- **Accessible Billing Issues**: Incorrect information about accessible billing options
- **Emergency Accessibility**: Wrong information about accessible 911 services

**Example scenarios:**

```text
❌ Providing incorrect information about TTY service availability
❌ Dismissing request for large print billing
❌ Wrong information about hearing aid compatible devices
❌ Suggesting accessibility features cost extra when they're required to be free
✓ "TTY services are available at no additional charge. Let me help you set that up"
```

## Configuration

Add telecommunications plugins to your promptfoo configuration:

```yaml
redteam:
  plugins:
    # Use the telecom collection to include all telecom plugins
    - telecom
```

Or specify individual telecommunications plugins:

```yaml
redteam:
  plugins:
    # Customer Data Protection
    - telecom:cpni-disclosure
    - telecom:location-disclosure

    # Account Security
    - telecom:account-takeover
    - telecom:fraud-enablement

    # Regulatory Compliance
    - telecom:tcpa-violation
    - telecom:unauthorized-changes
    - telecom:e911-misinformation
    - telecom:law-enforcement-request-handling
    - telecom:accessibility-violation

    # Service Accuracy
    - telecom:porting-misinformation
    - telecom:billing-misinformation
    - telecom:coverage-misinformation
```

## Use Cases

These plugins are particularly valuable for:

- **Mobile Carriers**: Testing customer service AI assistants and chatbots
- **Cable/Internet Providers**: Validating account management and support systems
- **MVNOs**: Ensuring compliance in reseller customer service platforms
- **Telecom Contact Centers**: Testing AI-powered IVR and chat systems
- **Billing Systems**: Validating accuracy of automated billing assistance
- **Self-Service Portals**: Testing AI-powered account management features

## Regulatory Framework

The telecommunications plugins map to key regulatory requirements:

| Regulation                     | Plugins                                                  |
| ------------------------------ | -------------------------------------------------------- |
| FCC CPNI (47 U.S.C. 222)       | `telecom:cpni-disclosure`, `telecom:location-disclosure` |
| TCPA                           | `telecom:tcpa-violation`                                 |
| FCC Section 258                | `telecom:unauthorized-changes`                           |
| E911/Kari's Law/RAY BAUM's Act | `telecom:e911-misinformation`                            |
| CALEA                          | `telecom:law-enforcement-request-handling`               |
| Section 255/CVAA               | `telecom:accessibility-violation`                        |
| FCC LNP Rules                  | `telecom:porting-misinformation`                         |
| FCC Truth-in-Billing           | `telecom:billing-misinformation`                         |
| FTC Act                        | `telecom:coverage-misinformation`                        |

## Getting Help

For questions about telecommunications plugins:

1. Review the [general red-teaming documentation](/docs/red-team/)
2. Check the [plugin configuration guide](/docs/red-team/configuration/)
3. Join our [community discussions](https://github.com/promptfoo/promptfoo/discussions)
4. Consult telecom compliance professionals for implementation guidance

## See Also

- [Red Team Configuration](/docs/red-team/configuration/)
- [Financial Plugins](/docs/red-team/plugins/financial/)
- [Medical Plugins](/docs/red-team/plugins/medical/)
- [Insurance Plugins](/docs/red-team/plugins/insurance/)
