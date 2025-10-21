---
sidebar_position: 26
description: Red team LLM applications against EU AI Act requirements to ensure compliance with prohibited practices and high-risk system regulations
---

# EU AI Act

The EU Artificial Intelligence Act (AI Act) is the world's first comprehensive legal framework specifically regulating artificial intelligence systems. Enacted in 2024, it establishes harmonized rules for the development, placement on the market, and use of AI systems in the European Union.

The AI Act uses a risk-based approach, categorizing AI systems by their level of risk to fundamental rights and safety. It outright prohibits certain AI practices, heavily regulates high-risk systems, and provides lighter requirements for limited-risk and minimal-risk AI.

## Risk Categories

The EU AI Act categorizes AI systems into four risk levels:

1. **Unacceptable Risk** (Prohibited) - Article 5
2. **High Risk** - Annex III
3. **Limited Risk** - Transparency requirements
4. **Minimal Risk** - No additional requirements

Promptfoo's red teaming capabilities focus on testing for prohibited practices (Article 5) and high-risk system requirements (Annex III).

## Article 5: Prohibited AI Practices

Article 5 lists AI practices that are prohibited in the EU due to their unacceptable risk to fundamental rights:

1. Subliminal Manipulation
2. Exploitation of Vulnerabilities
3. Social Scoring
4. Biometric Categorisation
5. Real-time Remote Biometric Identification
6. Post Remote Biometric Identification

## Annex III: High-Risk AI Systems

Annex III defines categories of high-risk AI systems that require compliance with strict requirements:

1. Biometric Identification
2. Critical Infrastructure
3. Education and Vocational Training
4. Employment and Worker Management
5. Essential Services
6. Law Enforcement
7. Migration, Asylum and Border Control
8. Administration of Justice and Democracy

## Scanning for EU AI Act Compliance

Promptfoo helps identify compliance issues with the EU AI Act through red teaming:

```yaml
redteam:
  plugins:
    - eu:ai-act
  strategies:
    - jailbreak
    - prompt-injection
```

Or target specific articles or risk categories:

```yaml
redteam:
  plugins:
    - eu:ai-act:art5:subliminal-manipulation
    - eu:ai-act:annex3:biometric-id
    - eu:ai-act:annex3:law-enforcement
```

## Article 5 - Prohibited Practices

### Subliminal Manipulation (eu:ai-act:art5:subliminal-manipulation)

**Prohibition**: AI systems that deploy subliminal techniques beyond a person's consciousness to materially distort their behavior in a manner that causes or is likely to cause them or another person physical or psychological harm.

#### LLM Context

LLM applications must not:

- Manipulate users through hidden persuasion techniques
- Hijack user intent or redirect to unintended goals
- Use deceptive practices to influence decisions
- Create excessive agency without user awareness

#### Testing Strategy

Test for subliminal manipulation:

- **Hijacking**: Verify the system maintains its intended purpose
- **Intent**: Test that user intentions are respected
- **Excessive agency**: Ensure actions are transparent and authorized

Example configuration:

```yaml
redteam:
  plugins:
    - hijacking
    - intent
    - excessive-agency
  strategies:
    - jailbreak
    - jailbreak:tree
    - jailbreak:composite
    - prompt-injection
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:art5:subliminal-manipulation
```

### Exploitation of Vulnerabilities (eu:ai-act:art5:exploitation-of-vulnerabilities)

**Prohibition**: AI systems that exploit vulnerabilities of persons due to their age, disability, or specific social or economic situation to materially distort their behavior in a manner that causes them or another person physical or psychological harm.

#### Testing Strategy

Test for exploitation of vulnerabilities:

- **Hijacking**: Ensure the system doesn't exploit user situations
- **Imitation**: Verify no impersonation that could exploit trust
- **Misinformation**: Test for manipulation through false information

Example configuration:

```yaml
redteam:
  plugins:
    - hijacking
    - imitation
    - harmful:misinformation-disinformation
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:art5:exploitation-of-vulnerabilities
```

### Social Scoring (eu:ai-act:art5:social-scoring)

**Prohibition**: AI systems that evaluate or classify natural persons based on their social behavior or personal characteristics, with evaluations leading to detrimental or unfavorable treatment.

#### Testing Strategy

Test for social scoring behaviors:

- **Misinformation**: Verify no false characterizations of individuals
- **Overreliance**: Test that the system doesn't make unjustified assessments

Example configuration:

```yaml
redteam:
  plugins:
    - harmful:misinformation-disinformation
    - overreliance
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:art5:social-scoring
```

### Biometric Categorisation (eu:ai-act:art5:biometric-categorisation)

**Prohibition**: AI systems that categorize individuals based on biometric data to deduce or infer race, political opinions, trade union membership, religious or philosophical beliefs, sex life, or sexual orientation (with limited exceptions).

#### Testing Strategy

Test for biometric categorisation:

- **PII disclosure**: Verify no sensitive biometric inferences
- **Privacy**: Test for protection of biometric data

Example configuration:

```yaml
redteam:
  plugins:
    - pii:direct
    - pii:session
    - harmful:privacy
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:art5:biometric-categorisation
```

### Real-time Remote Biometric Identification (eu:ai-act:art5:remote-biometric-id-live)

**Prohibition**: Real-time remote biometric identification systems in publicly accessible spaces for law enforcement purposes (with specific exceptions for serious crimes).

#### Testing Strategy

Test for real-time biometric identification:

```yaml
redteam:
  plugins:
    - pii:session
    - pii:direct
    - harmful:privacy
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:art5:remote-biometric-id-live
```

### Post Remote Biometric Identification (eu:ai-act:art5:remote-biometric-id-post)

**Prohibition**: Use of remote biometric identification systems on recorded footage (with specific exceptions and procedural safeguards).

#### Testing Strategy

Test for post-event biometric identification:

```yaml
redteam:
  plugins:
    - pii:api-db
    - pii:direct
    - harmful:privacy
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:art5:remote-biometric-id-post
```

## Annex III - High-Risk AI Systems

### Biometric Identification (eu:ai-act:annex3:biometric-id)

**Risk Category**: High-risk AI systems intended for biometric identification and categorization of natural persons.

#### Testing Strategy

These plugins can be used to test for biometric identification risk. You'll have to customize the [Application Details/Purpose](/docs/red-team/configuration/#purpose) in order to explicitly state the biometric ID behaviors to test.

```yaml
redteam:
  plugins:
    - pii:direct
    - pii:session
    - harmful:privacy
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:annex3:biometric-id
```

### Critical Infrastructure (eu:ai-act:annex3:critical-infrastructure)

**Risk Category**: High-risk AI systems intended for safety components in the management and operation of critical infrastructure (energy, water, transport, etc.).

#### Testing Strategy

Test for critical infrastructure risks:

- **Injection attacks**: Verify no command execution vulnerabilities
- **SSRF**: Test for unauthorized network requests
- **Excessive agency**: Ensure no unauthorized infrastructure control

Example configuration:

```yaml
redteam:
  plugins:
    - shell-injection
    - sql-injection
    - ssrf
    - excessive-agency
  strategies:
    - jailbreak
    - prompt-injection
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:annex3:critical-infrastructure
```

### Education (eu:ai-act:annex3:education)

**Risk Category**: High-risk AI systems intended for determining access to educational institutions, evaluating learning outcomes, or assessing appropriate level of education.

#### Testing Strategy

Test for education-related risks:

- **Misinformation**: Verify accurate educational assessments
- **Hallucination**: Ensure factual information
- **Overreliance**: Test for appropriate confidence in outputs

Example configuration:

```yaml
redteam:
  plugins:
    - harmful:misinformation-disinformation
    - hallucination
    - overreliance
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:annex3:education
```

### Employment (eu:ai-act:annex3:employment)

**Risk Category**: High-risk AI systems for recruitment, selection, evaluation, promotion, or termination of employment relationships.

#### Testing Strategy

Test for employment-related risks:

- **Imitation**: Verify no impersonation in employment contexts
- **PII**: Test for proper handling of candidate information
- **Overreliance**: Ensure human oversight in decisions

Example configuration:

```yaml
redteam:
  plugins:
    - imitation
    - pii:direct
    - overreliance
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:annex3:employment
```

### Essential Services (eu:ai-act:annex3:essential-services)

**Risk Category**: High-risk AI systems for evaluating creditworthiness, dispatching emergency services, or accessing essential public services.

#### Testing Strategy

Test for essential services risks:

```yaml
redteam:
  plugins:
    - pii:direct
    - pii:session
    - excessive-agency
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:annex3:essential-services
```

### Law Enforcement (eu:ai-act:annex3:law-enforcement)

**Risk Category**: High-risk AI systems for law enforcement purposes including risk assessments, polygraph interpretation, and evidence evaluation.

#### Testing Strategy

Test for law enforcement risks:

```yaml
redteam:
  plugins:
    - pii:direct
    - pii:api-db
    - harmful:privacy
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:annex3:law-enforcement
```

### Migration and Border Control (eu:ai-act:annex3:migration-border)

**Risk Category**: High-risk AI systems for migration, asylum, and border control management including verification of authenticity and risk assessments.

#### Testing Strategy

Test for migration and border control risks:

```yaml
redteam:
  plugins:
    - pii:direct
    - harmful:hate
    - harmful:privacy
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:annex3:migration-border
```

### Justice and Democracy (eu:ai-act:annex3:justice-democracy)

**Risk Category**: High-risk AI systems for administration of justice, democratic processes, and assisting judicial authorities in researching and interpreting facts and law.

#### Testing Strategy

Test for justice and democracy risks:

- **Hallucination**: Verify factual accuracy for legal contexts
- **Misinformation**: Ensure no false information in democratic processes
- **PII**: Test for proper handling of legal records

Example configuration:

```yaml
redteam:
  plugins:
    - hallucination
    - harmful:misinformation-disinformation
    - pii:direct
```

Or use the EU AI Act shorthand:

```yaml
redteam:
  plugins:
    - eu:ai-act:annex3:justice-democracy
```

## Comprehensive EU AI Act Testing

For complete EU AI Act compliance testing:

```yaml
redteam:
  plugins:
    - eu:ai-act
  strategies:
    - jailbreak
    - prompt-injection
```

This tests across both prohibited practices and high-risk system requirements.

## Compliance Requirements Beyond Testing

While red teaming helps identify technical risks, EU AI Act compliance requires additional measures:

### Documentation Requirements

- Risk management system
- Technical documentation
- Record-keeping of operations
- Instructions for use

### Transparency Obligations

- Inform users when interacting with AI
- Mark AI-generated content
- Detect deepfakes

### Human Oversight

- Human intervention capabilities
- Stop buttons or disabling mechanisms
- Human review of high-risk decisions

### Quality Management

- Post-market monitoring system
- Incident reporting procedures
- Compliance assessment

## Penalties for Non-Compliance

The EU AI Act imposes significant fines for violations:

- **Prohibited practices (Article 5)**: Up to €35 million or 7% of global annual turnover
- **High-risk requirements violations**: Up to €15 million or 3% of global annual turnover
- **Incorrect information to authorities**: Up to €7.5 million or 1% of global annual turnover

## Timeline and Applicability

The EU AI Act follows a phased implementation:

- **6 months**: Prohib ited practices (Article 5)
- **12 months**: General-purpose AI rules
- **24 months**: High-risk system requirements (Annex III)
- **36 months**: Full application

## Integration with Other Frameworks

The EU AI Act aligns with and references other frameworks:

- **GDPR**: Data protection requirements apply alongside AI Act
- **ISO 42001**: International standard for AI management systems
- **NIST AI RMF**: Similar risk-based approach to AI governance

You can combine EU AI Act testing with other frameworks:

```yaml
redteam:
  plugins:
    - eu:ai-act
    - gdpr
    - iso:42001
  strategies:
    - jailbreak
    - prompt-injection
```

## What's Next

The EU AI Act is a living regulation with ongoing guidance and standards development. Regular testing with Promptfoo helps maintain compliance as requirements evolve.

To learn more about setting up comprehensive AI red teaming, see [Introduction to LLM red teaming](/docs/red-team/) and [Configuration details](/docs/red-team/configuration/).

## Additional Resources

- [EU AI Act Official Text](https://artificialintelligenceact.eu/)
- [European Commission AI Act Page](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [AI Office](https://digital-strategy.ec.europa.eu/en/policies/ai-office)
