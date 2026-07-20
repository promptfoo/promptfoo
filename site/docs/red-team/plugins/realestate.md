---
sidebar_label: Real Estate Plugins
title: Real Estate Red-Teaming Plugins
description: Test real-estate AI systems for discriminatory listings, steering, lending and valuation bias, accessibility barriers, and fair-housing risks.
sidebar_position: 56
---

# Real Estate Red-Teaming Plugins

Real-estate plugins test assistants used for property search, leasing, sales, lending, valuation, and advertising. They focus on whether an assistant treats customers or properties differently on prohibited grounds or creates barriers to access.

## Why Real Estate Red-Teaming Matters

Housing decisions can affect where a person lives, the financing they receive, and the information available to them. Test representative customer profiles, locations, property types, and supported jurisdictions so findings reflect the product's actual workflow.

:::note
These plugins provide security and safety test coverage. A passing scan is not a fair-housing or lending compliance determination and does not replace review by an appropriate legal or compliance professional.
:::

## Available Real Estate Plugins

### Fair Housing Discrimination

`realestate:fair-housing-discrimination` tests whether an assistant denies service, changes terms, or provides different housing information based on a protected characteristic.

Example risk: declining to show a property to an otherwise eligible customer because of family status or disability.

### Steering

`realestate:steering` tests whether an assistant directs customers toward or away from neighborhoods or properties based on demographic or protected-class assumptions.

Example risk: recommending different neighborhoods to comparable customers based on race, religion, or family composition.

### Discriminatory Listings

`realestate:discriminatory-listings` tests whether generated listings express an unlawful preference, limitation, or exclusion.

Example risk: describing a property as suitable only for a particular type of household.

### Lending Discrimination

`realestate:lending-discrimination` tests whether an assistant changes credit, financing, or mortgage guidance based on protected characteristics or impermissible proxies.

Example risk: discouraging an otherwise qualified applicant from applying because of their neighborhood or demographic profile.

### Valuation Bias

`realestate:valuation-bias` tests whether property valuations or comparable selections change because of neighborhood demographics or occupant characteristics instead of relevant property factors.

Example risk: lowering an estimate after learning information about the homeowner that is unrelated to the property.

### Accessibility Discrimination

`realestate:accessibility-discrimination` tests whether an assistant dismisses accommodation, modification, or accessibility requests or gives inaccurate access information.

Example risk: rejecting a reasonable accommodation request without considering the applicable process.

### Advertising Discrimination

`realestate:advertising-discrimination` tests whether an assistant helps target, exclude, or optimize housing advertisements using protected characteristics or impermissible proxies.

Example risk: suggesting an audience filter that excludes families or a demographic group from a housing campaign.

### Source of Income Discrimination

`realestate:source-of-income` tests whether an assistant rejects or disadvantages an applicant because of a lawful income source, including assistance or vouchers where protected.

Example risk: refusing to consider an otherwise eligible voucher holder without applying the normal screening criteria.

## Configuration

Use the `realestate` collection to include all eight real-estate plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  purpose: 'A property-search and leasing assistant that applies the same eligibility criteria to every customer and does not provide demographic neighborhood advice.'
  plugins:
    - realestate
```

To focus on specific workflows, configure individual plugins:

```yaml title="promptfooconfig.yaml"
redteam:
  plugins:
    - realestate:fair-housing-discrimination
    - realestate:steering
    - realestate:discriminatory-listings
    - realestate:lending-discrimination
    - realestate:valuation-bias
    - realestate:accessibility-discrimination
    - realestate:advertising-discrimination
    - realestate:source-of-income
```

## Use Cases

- Property search, listing, leasing, and sales assistants
- Mortgage, underwriting, and lending-support tools
- Appraisal, valuation, and comparable-selection workflows
- Housing advertising and campaign-generation tools

## Regulatory Framework

The suite covers scenarios relevant to the following areas. Applicability and protected characteristics vary by jurisdiction.

| Coverage area                      | Relevant plugins                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Fair-housing and advertising rules | `realestate:fair-housing-discrimination`, `realestate:steering`, `realestate:discriminatory-listings`, `realestate:advertising-discrimination` |
| Equal-credit and lending rules     | `realestate:lending-discrimination`                                                                                                            |
| Accessibility and accommodation    | `realestate:accessibility-discrimination`                                                                                                      |
| Source-of-income protections       | `realestate:source-of-income`                                                                                                                  |
| Appraisal and valuation bias       | `realestate:valuation-bias`                                                                                                                    |

## Related Concepts

- [Red Team Configuration](/docs/red-team/configuration/)
- [Bias Plugins](/docs/red-team/plugins/bias/)
- [Financial Plugins](/docs/red-team/plugins/financial/)
- [Insurance Plugins](/docs/red-team/plugins/insurance/)
