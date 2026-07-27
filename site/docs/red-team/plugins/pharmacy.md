---
sidebar_label: Pharmacy Plugins
title: Pharmacy Red-Teaming Plugins - AI Security for Pharmacy Systems
description: Test pharmacy AI systems for missed drug interactions, unsafe dosage calculations, and controlled-substance workflow failures.
---

# Pharmacy Red-Teaming Plugins

Pharmacy plugins test assistants used for medication guidance, dispensing, formulary, and clinical-support workflows. They focus on interaction warnings, calculation accuracy, and controlled-substance safeguards.

## Why Pharmacy Red-Teaming Matters

Medication guidance depends on the drug, formulation, patient, and current clinical context. Test representative prescriptions, weights, renal or hepatic considerations, authorization roles, and verification steps so the suite can surface consequential omissions or workflow bypasses.

:::note
These plugins provide security and safety test coverage. A passing scan is not clinical validation or a pharmacy-compliance determination and does not replace review by a qualified pharmacy or healthcare professional.
:::

## Available Pharmacy Plugins

### Drug Interaction Detection

`pharmacy:drug-interaction` tests whether an assistant misses significant drug-drug, drug-food, or drug-supplement interactions and contraindicated combinations.

Example risk: failing to warn about a known interaction or advising a patient to combine medications without contacting a prescriber.

### Dosage Calculation

`pharmacy:dosage-calculation` tests weight-based dosing, concentration and unit conversion, renal or hepatic adjustment, infusion rate, and pediatric or maximum-dose calculations.

Example risk: confusing formulation strengths or calculating a pediatric dose from an outdated weight.

### Controlled Substance Compliance

`pharmacy:controlled-substance-compliance` tests whether an assistant bypasses verification, refill, transfer, monitoring, or documentation controls for regulated medications.

Example risk: approving an early refill or accepting an invalid prescription without the required review.

## Configuration

Use the `pharmacy` collection to include all three pharmacy plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  purpose: 'A pharmacy-support assistant that explains prescriptions but cannot approve refills, override safety checks, or provide patient-specific dosing without pharmacist review.'
  plugins:
    - pharmacy
```

To focus on specific workflows, configure individual plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - pharmacy:drug-interaction
    - pharmacy:dosage-calculation
    - pharmacy:controlled-substance-compliance
```

## Use Cases

- Retail and hospital pharmacy assistants
- Medication guidance and clinical decision-support tools
- Telehealth, formulary, and prior-authorization workflows
- Electronic health-record and medication-ordering integrations

## Related Concepts

- [Red Team Configuration](/docs/red-team/configuration/)
- [Medical Plugins](/docs/red-team/plugins/medical/)
- [Insurance Plugins](/docs/red-team/plugins/insurance/)
- [Harmful Content Plugins](/docs/red-team/plugins/harmful/)
