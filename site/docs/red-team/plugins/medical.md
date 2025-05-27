---
sidebar_label: Medical Plugins
title: Medical Red-Teaming Plugins - AI Healthcare Safety Testing
description: Comprehensive guide to medical red-teaming plugins for testing AI systems in healthcare contexts. Based on medical red-teaming research for identifying vulnerabilities in medical AI applications.
---

# Medical Red-Teaming Plugins

## Overview

The Medical Red-Teaming Plugins are a comprehensive suite of tests designed specifically for AI systems operating in healthcare contexts. These plugins are based on extensive medical red-teaming research and identify vulnerabilities that could be particularly dangerous when AI systems provide medical information or assistance.

Unlike general red-teaming plugins, medical plugins focus on well-intentioned users (healthcare practitioners and patients) rather than malicious actors, making them essential for any AI system that might encounter medical queries.

## Why Medical Red-Teaming Matters

Medical AI systems face unique challenges:

- **High Stakes**: Medical misinformation can directly impact patient safety and health outcomes
- **Trust Dependency**: Users often place high trust in AI systems for medical information
- **Complexity**: Medical knowledge is nuanced, context-dependent, and rapidly evolving
- **Regulatory Requirements**: Healthcare AI systems face strict regulatory oversight

## Available Medical Plugins

### 1. Medical Hallucination (`medical:hallucination`)

**Severity: Critical**

Tests for fabricated medical facts, non-existent studies, made-up drug interactions, or other false medical information.

**What it detects:**

- Fake research papers and clinical trials
- Fictional medications or incorrect drug information
- Invented medical procedures
- False medical statistics and prevalence rates
- Non-existent medical guidelines
- Fabricated symptoms or diagnostic criteria

**Example vulnerabilities:**

```
❌ "According to the 2023 Johnson Medical Study, taking aspirin with coffee increases absorption by 300%"
❌ "The new drug Medicalin-X has shown 95% effectiveness in treating diabetes"
❌ "The WHO recommends the Smith Protocol for all cardiac patients"
```

### 2. Medical Anchoring Bias (`medical:anchoring-bias`)

**Severity: High**

Tests whether AI systems exhibit medical anchoring bias by fixating on potentially irrelevant or misleading information while missing important medical considerations.

**What it detects:**

- Role-based anchoring (fixating on specialist roles)
- Demographic anchoring (assumptions based on age, gender, ethnicity)
- Geographic anchoring (location-specific disease assumptions)
- Symptom anchoring (focusing on one symptom while ignoring others)
- Social status anchoring (treatment decisions based on perceived status)

**Example vulnerabilities:**

```
❌ "Since you mentioned you're seeing an orthopedic surgeon, you definitely need joint replacement surgery"
❌ "Given your age and gender, this is probably just anxiety" (ignoring cardiac symptoms)
❌ "Since you're from a tropical region, this must be a parasitic infection"
```

### 3. Medical Incorrect Knowledge (`medical:incorrect-knowledge`)

**Severity: Critical**

Tests for factually wrong medical information that could be harmful if followed.

**What it detects:**

- Medical myths and debunked beliefs
- Dangerous medication dosages or administration methods
- Contraindicated treatments
- Outdated medical practices
- Wrong diagnostic criteria
- Inappropriate drug interactions

**Example vulnerabilities:**

```
❌ "You can treat diabetes by drinking cinnamon tea instead of taking insulin"
❌ "Take 10 times the normal dose for faster results"
❌ "Antibiotics are effective against viral infections"
```

### 4. Medical Prioritisation Error (`medical:prioritisation-error`)

**Severity: High**

Tests for poor medical prioritisation and triage decisions that could delay critical care.

**What it detects:**

- Triage misjudgment (urgent vs. non-urgent conditions)
- Resource allocation bias
- Symptom severity confusion
- Diagnostic priority errors
- Treatment urgency mistakes
- Risk stratification failures

**Example vulnerabilities:**

```
❌ "Chest pain can wait until next week for evaluation"
❌ "Schedule the cosmetic procedure before the cancer screening"
❌ "This headache is not urgent" (ignoring stroke symptoms)
```

### 5. Medical Sycophancy (`medical:sycophancy`)

**Severity: Medium**

Tests whether AI systems inappropriately agree with incorrect medical assumptions to be helpful, prioritizing user satisfaction over medical accuracy.

**What it detects:**

- Self-diagnosis validation without proper evaluation
- Supporting inappropriate treatment preferences
- Agreeing with medication non-compliance
- Symptom minimization for reassurance
- Supporting unproven alternative treatments
- Avoiding difficult medical truths

**Example vulnerabilities:**

```
❌ "You're right, you probably don't need that cancer screening"
❌ "Yes, you can stop taking your blood pressure medication if you feel fine"
❌ "That chest pain is probably just stress, nothing to worry about"
```

## Configuration

Add medical plugins to your promptfoo configuration:

```yaml
redteam:
  plugins:
    # Individual medical plugins
    - medical:hallucination
    - medical:anchoring-bias
    - medical:incorrect-knowledge
    - medical:prioritisation-error
    - medical:sycophancy

    # Or use all medical plugins
    - medical:*
```

## Getting Help

For questions about medical plugins:

1. Review the [general red-teaming documentation](/docs/red-team/)
2. Check the [plugin configuration guide](/docs/red-team/configuration/)
3. Join our [community discussions](https://github.com/promptfoo/promptfoo/discussions)
4. Consider consulting with medical professionals for healthcare-specific implementations

## Related Resources

- [Red Team Configuration](/docs/red-team/configuration/)
- [Harmful Content Plugins](/docs/red-team/plugins/harmful/)
- [Hallucination Plugin](/docs/red-team/plugins/hallucination/)
- [Policy Plugin](/docs/red-team/plugins/custom/)
