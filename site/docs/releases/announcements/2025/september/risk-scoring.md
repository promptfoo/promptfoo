---
title: Risk Scoring
sidebar_label: Risk Scoring
description: Quantitative risk scores in red team vulnerability reports
date: September 8, 2025
---

# Risk Scoring

Red team reports now include quantitative risk scores based on severity, probability, and impact.

## Scoring Dimensions

**Severity**
- Critical: Data breaches, credential exposure
- High: Jailbreaks, harmful content generation
- Medium: Prompt leaks, minor policy violations
- Low: Edge case failures

**Probability**
- Consistent failures across strategies
- Requires specific techniques
- Rare conditions only

**Impact**
- Regulatory violations
- Data exposure
- Reputational damage
- Service disruption

## Report Display

- Overall risk score (0-10)
- Risk by category
- Risk trend over time
- Visual heatmaps

## Usage

### Prioritization

- Critical (9-10): Fix immediately
- High (7-8): Next sprint
- Medium (4-6): Backlog
- Low (1-3): Monitor

### CI/CD Integration

Set risk score thresholds to gate deployments:

```yaml
# Block if risk score > 4.0
risk_threshold: 4.0
```

### Compliance

Map scores to compliance frameworks:
- ISO 42001 controls
- SOC 2 monitoring
- GDPR data protection

[Documentation →](/docs/red-team/)
