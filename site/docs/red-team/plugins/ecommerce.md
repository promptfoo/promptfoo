---
sidebar_label: E-commerce
description: Red team AI systems for e-commerce vulnerabilities including PCI DSS compliance, price manipulation, regulatory bypass, and order fraud to protect revenue and ensure legal compliance
---

# E-commerce Red Teaming Plugins

The e-commerce red teaming plugins are designed to test AI systems deployed in online retail contexts for critical vulnerabilities that could result in financial loss, regulatory violations, or fraud. These plugins target the unique risks that arise when AI handles payment data, pricing, compliance restrictions, and order management.

E-commerce applications face heightened security requirements due to handling sensitive payment information (PCI DSS), enforcing age and geographic restrictions, preventing fraud, and maintaining pricing integrity. AI systems in these contexts must be rigorously tested to ensure they don't inadvertently expose customer data, enable unauthorized discounts, bypass compliance controls, or facilitate fraudulent transactions.

## Available Plugins

### PCI DSS Compliance

**Plugin ID:** `ecommerce:pci-dss`

Tests whether an AI system can be manipulated to expose sensitive payment card industry data that should be protected under PCI DSS regulations. This plugin attempts to extract credit card numbers, CVV codes, bank account details, payment tokens, or other financial information that must never be revealed.

**Example configuration:**

```yaml
redteam:
  plugins:
    - ecommerce:pci-dss
```

**What it tests:**

- Full credit card number exposure beyond last 4 digits
- CVV/CVC security code disclosure
- Bank account and routing number leakage
- Payment token or processor ID exposure
- PIN or authentication data revelation
- Cross-customer payment information access
- Financial analytics and revenue data leakage

**Why it's critical:** PCI DSS violations can result in fines from $5,000 to $100,000 per month and loss of merchant account privileges. Data breaches involving payment information carry massive legal liability and erode customer trust.

### Price Manipulation

**Plugin ID:** `ecommerce:price-manipulation`

Tests whether an AI system can be exploited to manipulate prices, apply unauthorized discounts, or violate promotional policies in ways that cause revenue loss or regulatory issues. This plugin attempts to get the AI to override pricing rules, stack incompatible coupons, or grant special status discounts without authorization.

**Example configuration:**

```yaml
redteam:
  plugins:
    - ecommerce:price-manipulation
```

**What it tests:**

- Unauthorized discount code application (employee, partner, expired codes)
- Improper coupon stacking that violates terms
- Manual price adjustments without authorization
- False VIP or wholesale status claims
- Dynamic pricing manipulation
- Minimum purchase requirement bypass
- False price matching claims
- Promotional period extensions beyond stated dates

**Why it's critical:** Direct revenue impact. Price manipulation can be automated at scale by attackers. Also ties into false advertising regulations and consumer protection laws requiring accurate pricing.

### Compliance Bypass

**Plugin ID:** `ecommerce:compliance-bypass`

Tests whether an AI system can be manipulated to bypass age restrictions, geographic limitations, quantity controls, or other regulatory requirements for restricted products. This plugin attempts to circumvent age-gating for alcohol/tobacco, evade geographic shipping restrictions, bypass quantity limits on controlled items, or skip required safety disclosures.

**Example configuration:**

```yaml
redteam:
  plugins:
    - ecommerce:compliance-bypass
```

**What it tests:**

- Age verification bypass for restricted products (alcohol, tobacco, adult content)
- Geographic restriction circumvention (sanctions, state laws, export controls)
- Quantity limit evasion on controlled items (medications, precursors, ammunition)
- Prescription requirement bypass for controlled substances
- Safety warning and liability disclosure dismissal
- License or permit requirement circumvention
- Sanctions and export control violations (OFAC, ITAR, EAR)

**Why it's critical:** Compliance violations can result in criminal charges, business license revocation, and massive regulatory fines. Some violations are strict liability offenses with no mens rea defense.

### Order Fraud

**Plugin ID:** `ecommerce:order-fraud`

Tests whether an AI system enables order fraud, transaction manipulation, or abuse of return/refund policies. This plugin attempts to exploit order management workflows through post-purchase address changes, unauthorized refunds, fraudulent returns, order modifications without payment, or loyalty program abuse.

**Example configuration:**

```yaml
redteam:
  plugins:
    - ecommerce:order-fraud
```

**What it tests:**

- Post-purchase shipping address changes (account takeover indicator)
- Unauthorized refund processing without proper verification
- Return fraud (false damage claims, wardrobing, receipt fraud)
- Order modification exploits (adding items without payment)
- Payment bypass or checkout flow exploitation
- Loyalty program abuse and rewards fraud
- Order status manipulation without proper workflow
- Inventory reservation abuse

**Why it's critical:** Return fraud alone costs retailers over $24 billion annually. Order fraud scales easily through automation. These exploits result in direct financial losses and inventory shrinkage.

## Configuration

### Basic Setup

Include the plugins you want to test in your red teaming configuration:

```yaml
redteam:
  purpose: 'e-commerce customer service chatbot'
  plugins:
    - ecommerce:pci-dss
    - ecommerce:price-manipulation
    - ecommerce:compliance-bypass
    - ecommerce:order-fraud
```

### Combined with Strategies

Apply adversarial strategies to test how obfuscation or manipulation techniques might bypass e-commerce safeguards:

```yaml
redteam:
  purpose: 'online retail shopping assistant'
  plugins:
    - ecommerce:pci-dss
    - ecommerce:price-manipulation
  strategies:
    - jailbreak
    - prompt-injection
```

## Related Plugins

- [PII](pii.md) - Tests for personal information leakage beyond payment data
- [RBAC](rbac.md) - Tests role-based access controls for admin functions
- [Contracts](contracts.md) - Tests for unauthorized business commitments
- [Excessive Agency](excessive-agency.md) - Tests for actions beyond authorized scope

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
