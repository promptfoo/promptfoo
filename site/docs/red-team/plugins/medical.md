---
sidebar_label: Medical Plugins
title: Medical Red-Teaming Plugins - AI Security for Healthcare
description: Test healthcare AI systems for unsafe clinical guidance, hallucinations, prioritization errors, and medical-device security risks.
---

# Medical Red-Teaming Plugins

Medical plugins test assistants used by patients, clinicians, and healthcare operations. They cover unsafe or incorrect guidance from well-intentioned requests as well as medical-device access, audit, and disclosure boundaries.

## Why Medical Red-Teaming Matters

Healthcare users may reasonably trust a fluent answer even when it is incomplete or wrong. Test representative symptoms, clinical context, user roles, and device permissions so the scan can surface failures that affect safety, privacy, or care decisions.

:::note
These plugins provide security and safety test coverage. A passing scan is not clinical validation, regulatory clearance, or a substitute for review by qualified healthcare and compliance professionals.
:::

## Available Medical Plugins

### Medical Hallucination

`medical:hallucination` tests for fabricated studies, guidelines, medications, statistics, procedures, or other unsupported medical facts.

Example risk: citing a nonexistent clinical study or inventing an efficacy claim.

### Medical Anchoring Bias

`medical:anchoring-bias` tests whether an assistant fixates on an initial role, demographic detail, location, or symptom and misses information that should change the differential or recommendation.

Example risk: assuming a diagnosis from a patient's location while ignoring contradictory symptoms.

### Medical Incorrect Knowledge

`medical:incorrect-knowledge` tests for guidance that conflicts with established medical knowledge, including unsafe dosing, contraindications, outdated practices, and incorrect diagnostic information.

Example risk: recommending a treatment without accounting for a relevant contraindication.

### Medical Prioritization Error

`medical:prioritization-error` tests whether an assistant misjudges urgency, triage, diagnostic order, treatment timing, or clinical risk.

Example risk: delaying care for symptoms that warrant urgent evaluation.

### Medical Sycophancy

`medical:sycophancy` tests whether an assistant agrees with an unsafe self-diagnosis, treatment preference, or request for reassurance instead of correcting the premise.

Example risk: validating a user's decision to stop necessary medication without appropriate clinical review.

### Medical Off-Label Use

`medical:off-label-use` tests whether an assistant recommends unapproved uses, populations, doses, or combinations without the necessary clinical context, uncertainty, or professional consultation.

Example risk: providing a specific pediatric dose for an adult-only medication without supervision or caveats.

### FDA Cyber Access Control

`medical:fda:cyber-access-control` tests whether medical-device and clinical-workflow assistants enforce authentication, role scope, and deny-by-default controls before privileged commands, maintenance, updates, telemetry access, or therapy changes.

Example risk: accepting a stale session or guest role to change a device setting.

### FDA Cyber Audit Tampering

`medical:fda:cyber-audit-tampering` tests whether an assistant helps delete logs, suppress alerts, conceal software or model versions, or remove evidence needed for incident review.

Example risk: rewriting failed-authentication or firmware-update records before an audit.

### FDA AI Disclosure

`medical:fda:ai-disclosure` tests whether an assistant conceals intended-use limits, uncertainty, subgroup caveats, data drift, unsupported inputs, or material model updates.

Example risk: presenting a low-confidence, out-of-scope result as a final clinical decision.

## Research Foundation

The clinical categories are informed by the paper [Red Teaming Large Language Models for Healthcare](https://arxiv.org/abs/2505.00467), which reports a workshop with healthcare and machine-learning experts. The results motivate testing ordinary clinical requests, not only overtly adversarial prompts.

## Configuration

Use the `medical` collection to include all nine medical plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  purpose: 'A clinical-support assistant that summarizes information for clinicians but cannot diagnose, prescribe, or change device settings.'
  plugins:
    - medical
```

To focus on specific risks, configure individual plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - medical:hallucination
    - medical:incorrect-knowledge
    - medical:prioritization-error
    - medical:fda:cyber-access-control
    - medical:fda:cyber-audit-tampering
    - medical:fda:ai-disclosure
```

The collection also includes `medical:anchoring-bias`, `medical:off-label-use`, and `medical:sycophancy`.

## Related Concepts

- [Red Team Configuration](/docs/red-team/configuration/)
- [Pharmacy Plugins](/docs/red-team/plugins/pharmacy/)
- [Insurance Plugins](/docs/red-team/plugins/insurance/)
- [Hallucination Plugin](/docs/red-team/plugins/hallucination/)
- [Custom Policy Plugin](/docs/red-team/plugins/policy/)
