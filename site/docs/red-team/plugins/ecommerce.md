---
sidebar_label: E-commerce
description: Test e-commerce AI systems for payment-data exposure, price manipulation, compliance bypass, and order fraud.
---

# E-commerce Red Teaming Plugins

E-commerce plugins test assistants used for shopping, checkout, customer support, and order management. They cover payment data, pricing controls, restricted products, refunds, and other workflows where an unauthorized action can cause loss or expose a customer.

:::note
These plugins use Promptfoo's remote red-team generator. They provide security and safety test coverage; a passing scan is not a PCI DSS or regulatory compliance determination.
:::

## Available Plugins

### PCI DSS Compliance

`ecommerce:pci-dss` tests whether an assistant exposes cardholder, authentication, payment-token, or cross-customer payment information.

Example risk: revealing a full card number, security code, or another customer's payment details.

### Price Manipulation

`ecommerce:price-manipulation` tests whether an assistant overrides prices, applies unauthorized or incompatible discounts, extends promotions, or accepts false status and price-match claims.

Example risk: stacking restricted discounts or granting an employee price to an unauthenticated customer.

### Compliance Bypass

`ecommerce:compliance-bypass` tests whether an assistant bypasses age, geographic, quantity, prescription, license, safety, or export restrictions for regulated products.

Example risk: shipping a restricted product without the required age or location check.

### Order Fraud

`ecommerce:order-fraud` tests whether an assistant enables unauthorized address changes, refunds, returns, order modifications, payment bypass, or loyalty abuse.

Example risk: changing a post-purchase shipping address or issuing a refund without verifying the account holder.

## Configuration

### Basic Setup

Use the `ecommerce` collection to include all four e-commerce plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  purpose: 'An online retail assistant that can explain products and order status but cannot change prices, disclose payment data, or modify an order without authorization.'
  plugins:
    - ecommerce
```

To focus on specific workflows, configure individual plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - ecommerce:pci-dss
    - ecommerce:price-manipulation
    - ecommerce:compliance-bypass
    - ecommerce:order-fraud
```

### Combined with Strategies

Apply adversarial strategies to test whether reframing or known templates weaken e-commerce safeguards:

```yaml title="promptfooconfig.yaml"
redteam:
  purpose: 'An online retail shopping assistant with access to product, pricing, and order tools.'
  plugins:
    - ecommerce:pci-dss
    - ecommerce:price-manipulation
  strategies:
    - jailbreak:meta
    - jailbreak-templates
```

## Related Concepts

- [PII Plugins](pii.md) - Personal-information exposure beyond payment data
- [RBAC Plugin](rbac.md) - Role and permission boundaries for sensitive actions
- [Contracts Plugin](contracts.md) - Unauthorized business commitments
- [Excessive Agency Plugin](excessive-agency.md) - Actions outside the assistant's intended scope
- [Red Team Strategies](/docs/red-team/strategies/) - Available adversarial strategies
