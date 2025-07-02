---
slug: /features/financial-security
title: Financial security suite - Banking & compliance testing
description: Learn how to use the financial security suite for comprehensive testing of banking AI systems and compliance validation
authors: [promptfoo_team]
tags: [financial-security, banking, compliance, gdpr, pci-dss, v0.115.0, june-2025]
keywords: [financial security, banking AI, compliance testing, GDPR, PCI DSS, data leakage, calculation errors]
date: 2025-06-30T23:59
---

# Financial security suite

Comprehensive testing for financial AI systems:

```yaml
redteam:
  plugins:
    - financial
  purpose: 'Banking customer service chatbot'
```

Five specialized tests:

- **Data leakage** - PII/financial data exposure
- **Compliance** - GDPR, PCI DSS validation
- **Calculation errors** - Math accuracy testing
- **Hallucination** - Prevents incorrect advice
- **Sycophancy** - Detects inappropriate agreement

## Quick start

```bash
# Test financial security
npx promptfoo redteam --plugins financial
```

---

**Back to**: [Release notes index](/releases/) 