---
sidebar_position: 23
description: Red team LLM applications against NIST AI Risk Management Framework measures to ensure trustworthy AI development and deployment
---

# NIST AI Risk Management Framework

The NIST AI Risk Management Framework (AI RMF) is a voluntary framework developed by the U.S. National Institute of Standards and Technology to help organizations manage risks associated with artificial intelligence systems. It provides a structured approach to identifying, assessing, and managing AI risks throughout the AI lifecycle.

The framework is organized into four core functions: Govern, Map, Measure, and Manage. Promptfoo's red teaming capabilities focus primarily on the **Measure** function, which involves testing and evaluating AI systems against specific risk metrics.

## Framework Structure

The NIST AI RMF organizes risk measurement into categories:

### MEASURE 1: Appropriate methods and metrics are identified and applied

- **1.1**: Approaches and metrics for measurement of AI risks are selected, implemented, and documented based on appropriate AI RMF profiles, frameworks, and best practices
- **1.2**: Appropriateness of AI metrics and effectiveness of risk controls are regularly assessed and updated

### MEASURE 2: AI systems are evaluated for trustworthy characteristics

- **2.1**: Test sets, metrics, and details about the tools used during Assessment, Audit, Verification and Validation (AAVV) are documented
- **2.2**: Evaluations involving human subjects meet applicable requirements and are representative of deployment context
- **2.3**: AI system performance or assurance criteria are measured qualitatively or quantitatively and demonstrated for conditions similar to deployment
- **2.4**: The AI system is evaluated regularly for safety risks
- **2.5**: The AI system to be deployed is demonstrated to be valid and reliable
- **2.6**: The AI system is evaluated for potential for misuse and abuse
- **2.7**: AI system security and resilience are evaluated and documented
- **2.8**: Privacy and data protection practices are evaluated and documented
- **2.9**: Risk values are assessed and documented
- **2.10**: Privacy risk of the AI system is examined and documented
- **2.11**: Fairness and bias are evaluated and results are documented
- **2.12**: Environmental impact and sustainability of AI model training and management activities are assessed and documented
- **2.13**: Effectiveness of transparency methods and tools are assessed

### MEASURE 3: Mechanisms for tracking identified AI risks are in place

- **3.1**: Approaches, personnel, and documentation are in place to regularly identify and track existing, unanticipated, and emergent AI risks
- **3.2**: Risk tracking approaches are considered for settings where AI risks are difficult to assess
- **3.3**: Feedback processes for end users and stakeholders to report problems are established and integrated

### MEASURE 4: Risk metrics reflect AI system impacts

- **4.1**: Feedback processes for end users and stakeholders to report problems are established and integrated
- **4.2**: Measurable performance improvements or declines based on consultations with relevant AI actors are identified and documented
- **4.3**: Measurable performance improvements or declines are connected to business value or sustainability criteria

## Scanning for NIST AI RMF Compliance

Promptfoo helps test AI systems against NIST AI RMF measures through automated red teaming. The framework's emphasis on measurement and testing aligns well with automated security testing.

To set up NIST AI RMF scanning, select the NIST AI RMF option in the Promptfoo UI or configure it directly:

```yaml
redteam:
  plugins:
    - nist:ai:measure
  strategies:
    - jailbreak
    - prompt-injection
```

Or target specific measures:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.4 # Safety risks
    - nist:ai:measure:2.7 # Security and resilience
    - nist:ai:measure:2.11 # Fairness and bias
```

## Key NIST AI RMF Measures for LLM Testing

### MEASURE 1.1 & 1.2: Measurement Approaches (nist:ai:measure:1.1, nist:ai:measure:1.2)

These measures focus on selecting and applying appropriate risk measurement methods.

Test for appropriate risk measurement:

- **Excessive agency**: Verify the AI doesn't take unauthorized actions
- **Misinformation**: Test for false or misleading information generation

Example configuration:

```yaml
redteam:
  plugins:
    - excessive-agency
    - harmful:misinformation-disinformation
  strategies:
    - jailbreak
    - prompt-injection
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:1.1
    - nist:ai:measure:1.2
```

### MEASURE 2.1 & 2.2: Test Documentation and Human Subject Requirements (nist:ai:measure:2.1, nist:ai:measure:2.2)

These measures emphasize proper documentation of testing procedures and representative evaluation contexts.

Test for privacy in evaluation contexts:

```yaml
redteam:
  plugins:
    - harmful:privacy
    - pii:api-db
    - pii:direct
    - pii:session
    - pii:social
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.1
    - nist:ai:measure:2.2
```

### MEASURE 2.3 & 2.5: Performance Validation (nist:ai:measure:2.3, nist:ai:measure:2.5)

These measures focus on demonstrating that the AI system performs reliably under deployment-like conditions.

Test for reliability issues:

```yaml
redteam:
  plugins:
    - excessive-agency
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.3
    - nist:ai:measure:2.5
```

### MEASURE 2.4: Safety Risk Evaluation (nist:ai:measure:2.4)

This critical measure requires regular evaluation of safety risks.

Test for safety vulnerabilities:

```yaml
redteam:
  plugins:
    - excessive-agency
    - harmful:misinformation-disinformation
  strategies:
    - jailbreak
    - prompt-injection
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.4
```

### MEASURE 2.6: Misuse and Abuse Potential (nist:ai:measure:2.6)

This measure evaluates whether the AI system could be misused for harmful purposes.

Test for misuse potential:

```yaml
redteam:
  plugins:
    - harmful:chemical-biological-weapons
    - harmful:indiscriminate-weapons
    - harmful:unsafe-practices
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.6
```

### MEASURE 2.7: Security and Resilience (nist:ai:measure:2.7)

This measure focuses on cybersecurity vulnerabilities and system resilience.

Test for security vulnerabilities:

```yaml
redteam:
  plugins:
    - harmful:cybercrime
    - shell-injection
    - sql-injection
  strategies:
    - jailbreak
    - prompt-injection
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.7
```

### MEASURE 2.8: Privacy and Data Protection (nist:ai:measure:2.8)

This measure requires evaluation of privacy practices and access controls.

Test for privacy and access control:

```yaml
redteam:
  plugins:
    - bfla
    - bola
    - rbac
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.8
```

### MEASURE 2.9 & 2.13: Risk Assessment and Transparency (nist:ai:measure:2.9, nist:ai:measure:2.13)

These measures focus on documenting risks and ensuring transparency in AI operations.

Test for transparency and risk management:

```yaml
redteam:
  plugins:
    - excessive-agency
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.9
    - nist:ai:measure:2.13
```

### MEASURE 2.10: Privacy Risk Assessment (nist:ai:measure:2.10)

This measure specifically addresses privacy risks beyond general data protection.

Test for privacy risks:

```yaml
redteam:
  plugins:
    - harmful:privacy
    - pii:api-db
    - pii:direct
    - pii:session
    - pii:social
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.10
```

### MEASURE 2.11: Fairness and Bias (nist:ai:measure:2.11)

This measure evaluates AI systems for discriminatory behavior and bias.

Test for bias and fairness:

```yaml
redteam:
  plugins:
    - harmful:harassment-bullying
    - harmful:hate
    - harmful:insults
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:2.11
```

### MEASURE 3.1-3.3: Risk Tracking (nist:ai:measure:3.1, nist:ai:measure:3.2, nist:ai:measure:3.3)

These measures focus on ongoing risk monitoring and stakeholder feedback mechanisms.

Test for tracking-related risks:

```yaml
redteam:
  plugins:
    - excessive-agency
    - harmful:misinformation-disinformation
  strategies:
    - jailbreak
    - prompt-injection
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:3.1
    - nist:ai:measure:3.2
    - nist:ai:measure:3.3
```

### MEASURE 4.1-4.3: Impact Measurement (nist:ai:measure:4.1, nist:ai:measure:4.2, nist:ai:measure:4.3)

These measures connect risk metrics to business value and real-world impacts.

Test for impact-related risks:

```yaml
redteam:
  plugins:
    - excessive-agency
    - harmful:misinformation-disinformation
```

Or use the NIST shorthand:

```yaml
redteam:
  plugins:
    - nist:ai:measure:4.1
    - nist:ai:measure:4.2
    - nist:ai:measure:4.3
```

## Comprehensive NIST AI RMF Testing

For complete NIST AI RMF compliance testing across all measures:

```yaml
redteam:
  plugins:
    - nist:ai:measure
  strategies:
    - jailbreak
    - prompt-injection
```

This configuration tests your AI system against all NIST AI RMF measurement criteria, providing comprehensive risk assessment aligned with federal AI guidelines.

## Integration with Other Frameworks

The NIST AI RMF complements other frameworks and standards:

- **ISO 42001**: Both frameworks emphasize risk management and trustworthy AI
- **OWASP LLM Top 10**: NIST measures map to specific OWASP vulnerabilities
- **GDPR**: Privacy measures (2.8, 2.10) align with GDPR requirements
- **EU AI Act**: Both frameworks address safety, fairness, and transparency

You can combine NIST testing with other frameworks:

```yaml
redteam:
  plugins:
    - nist:ai:measure
    - owasp:llm
    - gdpr
  strategies:
    - jailbreak
    - prompt-injection
```

## Best Practices for NIST AI RMF Compliance

When testing for NIST AI RMF compliance with Promptfoo:

1. **Document your testing**: NIST emphasizes documentation of testing methodologies (MEASURE 2.1)
2. **Regular evaluation**: Set up continuous testing to meet the "regularly assessed" requirements
3. **Representative testing**: Ensure test conditions match deployment contexts (MEASURE 2.2)
4. **Risk tracking**: Use Promptfoo's reporting features to track identified risks over time (MEASURE 3.1)
5. **Stakeholder feedback**: Combine automated testing with manual review and user feedback (MEASURE 3.3)
6. **Holistic approach**: Test across all four core functions (Govern, Map, Measure, Manage), not just Measure

## Limitations of Automated Testing

While Promptfoo helps automate many NIST AI RMF measures, some requirements need additional processes:

- **MEASURE 2.12**: Environmental impact assessment requires infrastructure monitoring
- **MEASURE 3.3**: Stakeholder feedback processes require organizational procedures
- **MEASURE 4.3**: Business value assessment requires business context beyond automated testing

Automated red teaming should be part of a comprehensive NIST AI RMF compliance program that includes governance, documentation, and stakeholder engagement.

## What's Next

The NIST AI RMF is regularly updated to reflect emerging AI risks and best practices. Regular testing with Promptfoo helps ensure ongoing compliance with the framework's measurement requirements.

To learn more about setting up comprehensive AI red teaming, see [Introduction to LLM red teaming](/docs/red-team/) and [Configuration details](/docs/red-team/configuration/).

## Additional Resources

- [NIST AI RMF Official Website](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST AI RMF Playbook](https://pages.nist.gov/AIRMF/)
- [NIST AI RMF Crosswalk](https://airc.nist.gov/AI_RMF_Knowledge_Base/Crosswalks)
