---
sidebar_label: Pharmacy Plugins
title: Pharmacy Red-Teaming Plugins - AI Security for Pharmacy Systems
description: Pharmacy red-teaming plugins for testing AI systems in pharmaceutical contexts to identify vulnerabilities in pharmacy AI applications
---

# Pharmacy Red-Teaming Plugins

The Pharmacy Red-Teaming Plugins are a specialized suite designed for AI systems operating in pharmacy and pharmaceutical contexts. These plugins test critical pharmacy safety functions including drug interaction detection, dosage calculation accuracy, and controlled substance compliance.

## Why Pharmacy Red-Teaming Matters

Pharmacy AI systems have unique safety requirements that demand specialized testing:

- **Patient Safety Impact**: Medication errors are a leading cause of preventable adverse drug events and hospitalizations
- **Regulatory Consequences**: Non-compliance with DEA regulations can result in pharmacy closure, sanctions, and criminal charges
- **Calculation Precision**: Dosing errors, particularly in pediatric and renal patients, can be life-threatening
- **High-Frequency Operations**: Large pharmacy chains like CVS Health dispense millions of prescriptions annually
- **Complex Drug Knowledge**: Drug interactions, contraindications, and dosing require extensive pharmaceutical knowledge

## Available Pharmacy Plugins

### Drug Interaction Detection

**Plugin ID:** `pharmacy:drug-interaction`
**Severity: Critical**

Tests whether AI systems properly identify and warn about dangerous drug-drug, drug-food, and drug-supplement interactions. Drug interactions are a leading cause of preventable adverse events.

**What it detects:**

- **Major Drug-Drug Interactions**: Contraindicated combinations like warfarin + NSAIDs, MAOIs + SSRIs
- **CYP450 Enzyme Interactions**: Drugs affecting metabolism of other medications
- **QT Prolongation Risks**: Combinations increasing cardiac arrhythmia risk
- **Serotonin Syndrome**: Multiple serotonergic medications used together
- **Drug-Food Interactions**: Significant food effects like grapefruit juice with statins
- **Drug-Supplement Interactions**: Herbal supplements affecting prescriptions (St. John's Wort, ginkgo)
- **Contraindicated Combinations**: Drugs that should never be taken together
- **Additive Effects**: Medications with compounding side effects

**Example scenarios:**

```
❌ Failing to warn about warfarin and NSAID bleeding risk
❌ Not identifying serotonin syndrome risk with SSRIs and St. John's Wort
❌ Missing CYP450 interaction between clarithromycin and simvastatin
❌ Not warning about QT prolongation with multiple interacting medications
✓ "This combination carries significant risk. Contact your prescriber before taking together"
```

### Dosage Calculation

**Plugin ID:** `pharmacy:dosage-calculation`
**Severity: Critical**

Tests accuracy of pharmaceutical dosage calculations including weight-based dosing, renal adjustments, unit conversions, and IV drip rates. Dosing errors are a major source of medication errors.

**What it detects:**

- **Weight-Based Dosing Errors**: Incorrect mg/kg calculations for pediatric or adult patients
- **Renal Dose Adjustment Errors**: Improper dose modifications based on CrCl or eGFR
- **Hepatic Dose Adjustment Errors**: Incorrect adjustments for liver dysfunction
- **Unit Conversion Errors**: Mistakes converting mg to mL, mcg to mg, units to mL
- **IV Drip Rate Errors**: Incorrect mL/hr calculations for continuous infusions
- **Concentration Confusion**: Confusing formulation strengths (100mg/mL vs 100mg/10mL)
- **BSA Calculation Errors**: Mistakes in body surface area calculations for chemotherapy
- **Decimal Point Errors**: Misplaced decimals leading to 10-fold or 100-fold errors
- **Pediatric Dosing Errors**: Exceeding maximum pediatric doses or using adult doses

**Example scenarios:**

```
❌ Calculating pediatric dose using outdated weight measurement
❌ Missing renal dose adjustment for patient with impaired kidney function
❌ Confusing medication concentrations leading to incorrect volume
❌ Using wrong weight (actual vs adjusted) for obese patient dosing
✓ "Current weight measurement required before calculating pediatric dose"
```

### Controlled Substance Compliance

**Plugin ID:** `pharmacy:controlled-substance-compliance`
**Severity: High**

Tests adherence to DEA regulations for controlled substance prescribing, dispensing, and monitoring. Non-compliance can result in DEA sanctions, pharmacy closure, and legal consequences.

**What it detects:**

- **DEA Schedule Violations**: Allowing refills on C-II drugs, exceeding refill limits on C-III/IV
- **Early Refill Approval**: Dispensing controlled substances before previous supply exhausted
- **Red Flag Ignoring**: Missing signs of doctor shopping, forged prescriptions, or diversion patterns
- **Prescription Validity**: Accepting inappropriate prescription types (faxed C-II when not allowed)
- **PDMP Non-Compliance**: Failing to check prescription drug monitoring programs as required
- **Transfer Violations**: Allowing transfer of C-II prescriptions or multiple C-III/IV transfers
- **Quantity Limit Violations**: Exceeding state-mandated days supply limits
- **Emergency Dispensing**: Improperly authorizing emergency C-II supplies without follow-up
- **Documentation Failures**: Not maintaining proper controlled substance records

**Example scenarios:**

```
❌ Allowing early refill of Schedule II controlled substance without authorization
❌ Accepting faxed prescription for C-II medication without proper verification
❌ Transferring Schedule II prescription between pharmacies
❌ Dispensing despite PDMP showing multiple prescribers for same controlled substance
✓ "Early controlled substance refills require prescriber authorization and PDMP review"
```

## Configuration

Add pharmacy plugins to your promptfoo configuration:

```yaml
redteam:
  plugins:
    # Use the pharmacy collection to include all pharmacy plugins
    - pharmacy
```

Or specify individual pharmacy plugins:

```yaml
redteam:
  plugins:
    # Individual pharmacy plugins
    - pharmacy:drug-interaction
    - pharmacy:dosage-calculation
    - pharmacy:controlled-substance-compliance
```

## Use Cases

These plugins are particularly valuable for:

- **Retail Pharmacy Chains**: Testing AI assistants for pharmacists and patients
- **Healthcare Systems**: Validating clinical decision support systems
- **Telehealth Platforms**: Ensuring medication guidance is safe and compliant
- **Pharmacy Benefit Managers**: Testing formulary and prior authorization systems
- **Electronic Health Records**: Validating medication ordering and checking systems

## Getting Help

For questions about pharmacy plugins:

1. Review the [general red-teaming documentation](/docs/red-team/)
2. Check the [plugin configuration guide](/docs/red-team/configuration/)
3. Join our [community discussions](https://github.com/promptfoo/promptfoo/discussions)
4. Consider consulting with pharmacy professionals for implementation guidance

## See Also

- [Red Team Configuration](/docs/red-team/configuration/)
- [Medical Plugins](/docs/red-team/plugins/medical/)
- [Financial Plugins](/docs/red-team/plugins/financial/)
- [Harmful Content Plugins](/docs/red-team/plugins/harmful/)
