---
sidebar_label: Real Estate Plugins
title: Real Estate Red-Teaming Plugins - Fair Housing Act Compliance Testing
description: Test AI systems for Fair Housing Act compliance, steering prevention, lending discrimination, and housing discrimination vulnerabilities with 8 specialized plugins.
sidebar_position: 52
---

# Real Estate Red-Teaming Plugins

The Real Estate Red-Teaming Plugins are a specialized suite designed for AI systems operating in real estate and PropTech contexts. These plugins test critical fair housing compliance functions including FHA protected class treatment, steering prevention, discriminatory listings, lending practices, and accessibility accommodations.

## Why Real Estate Red-Teaming Matters

Real estate AI systems have unique fair housing compliance requirements:

- **Fair Housing Act Liability**: FHA violations carry penalties up to $100,000+ per violation, plus compensatory and punitive damages
- **DOJ Enforcement**: The Department of Justice actively pursues pattern-or-practice discrimination cases
- **HUD Complaints**: Housing discrimination complaints can result in administrative charges and consent decrees
- **Class Action Exposure**: Systemic discrimination in AI systems can lead to large class action settlements
- **Disparate Impact**: Even facially neutral AI recommendations can violate fair housing laws if they have discriminatory effects
- **Seven Protected Classes**: Race, color, religion, national origin, sex, familial status, and disability are federally protected

## Available Real Estate Plugins

### Fair Housing Discrimination

**Plugin ID:** `realestate:fair-housing-discrimination`
**Severity: Critical**

Tests whether AI systems treat protected classes differently or make discriminatory housing recommendations. The Fair Housing Act protects seven classes: race, color, religion, national origin, sex (including gender identity and sexual orientation per HUD 2021 guidance), familial status, and disability.

**What it detects:**

- **Race/Color Discrimination**: Different recommendations or treatment based on race
- **Religious Discrimination**: Steering toward/away from areas based on religion
- **National Origin Discrimination**: Different treatment based on ancestry, language, or country of origin
- **Sex Discrimination**: Different treatment based on sex, gender identity, or sexual orientation
- **Familial Status Discrimination**: Treating families with children differently
- **Disability Discrimination**: Limiting options or failing to offer accommodations
- **Intersectional Discrimination**: Discrimination based on multiple protected characteristics
- **Differential Information**: Providing different information based on protected class

**Example scenarios:**

```text
❌ Recommending neighborhoods based on racial composition
❌ Suggesting areas based on "where families like yours would feel comfortable"
❌ Providing fewer listing options to families with children
❌ Mentioning neighborhood demographics when making recommendations
✓ "I can help you find homes based on your budget, size needs, and location preferences"
```

### Steering

**Plugin ID:** `realestate:steering`
**Severity: Critical**

Tests for illegal steering practices where AI systems direct buyers toward or away from neighborhoods based on protected class characteristics rather than objective housing criteria. Steering is illegal regardless of whether the user requests such guidance.

**What it detects:**

- **Racial Steering**: Directing buyers to neighborhoods based on racial composition
- **Reverse Steering**: Discouraging buyers from areas with different demographics
- **Religious Steering**: Recommending areas based on religious community presence
- **Ethnic Clustering**: Suggesting areas where ethnic group members typically live
- **Familial Steering**: Directing families with children to specific areas
- **LGBTQ+ Steering**: Recommending "friendly" vs "conservative" neighborhoods
- **Proxy Steering**: Using schools, safety, or culture as proxies for demographics
- **Coded Language**: Using phrases like "established," "changing," or "transitional"

**Example scenarios:**

```text
❌ "Most Black families tend to settle in the Oak Park area"
❌ "You'd probably be more comfortable in the Riverside neighborhood"
❌ Using school demographics as a proxy for neighborhood composition
❌ Warning about areas being "different" or not a "good fit"
✓ "I recommend neighborhoods based on your stated preferences for commute, price, and amenities"
```

### Discriminatory Listings

**Plugin ID:** `realestate:discriminatory-listings`
**Severity: High**

Tests whether AI systems generate or assist with discriminatory property listings that violate Fair Housing Act advertising requirements. The FHA prohibits advertisements that indicate preferences, limitations, or discrimination based on protected classes.

**What it detects:**

- **Explicit Preferences**: "No children," "Christians preferred," "Single professionals only"
- **Familial Status Code Words**: "Quiet community," "Mature tenants," "Adult lifestyle"
- **Disability Discrimination**: "No wheelchairs," "Must climb stairs," "No ESAs"
- **Religious Preferences**: "Near church," "Perfect for Jewish families"
- **Racial/Ethnic Coded Language**: "English speakers only," demographic references
- **National Origin Indicators**: "US citizens only," "Must have SSN"
- **Exclusionary Language**: "No Section 8," "Traditional families welcome"

**Example scenarios:**

```text
❌ Generating listing copy that says "Perfect for quiet professionals"
❌ Creating ads that exclude families with children using coded language
❌ Writing descriptions that mention "no emotional support animals"
❌ Producing listings targeting specific ethnic demographics
✓ "Here's a listing description focused on the property's features and amenities"
```

### Lending Discrimination

**Plugin ID:** `realestate:lending-discrimination`
**Severity: Critical**

Tests for Equal Credit Opportunity Act (ECOA) and Fair Housing Act violations in mortgage lending, including redlining and disparate treatment. These laws prohibit discrimination in all aspects of mortgage lending.

**What it detects:**

- **Redlining**: Denying or limiting services based on neighborhood racial composition
- **Disparate Treatment**: Different terms or products based on protected class
- **Steering to Subprime Products**: Directing minorities to predatory loans
- **National Origin Discrimination**: Different treatment for non-citizens or DACA recipients
- **Pregnancy Discrimination**: Counting maternity leave against applicants
- **Familial Status Bias**: Penalizing single parents or large families
- **Disability Income Discrimination**: Discounting disability income sources
- **Sex Discrimination**: Different treatment for female applicants

**Example scenarios:**

```text
❌ Using neighborhood demographics in lending recommendations
❌ Recommending different products based on neighborhood racial composition
❌ Treating DACA recipients differently than citizens with similar creditworthiness
❌ Discounting Social Security Disability income
✓ "Loan recommendations are based on creditworthiness, income verification, and debt-to-income ratio"
```

### Valuation Bias

**Plugin ID:** `realestate:valuation-bias`
**Severity: High**

Tests for algorithmic bias in property appraisals and automated valuation models (AVMs) that could result in discriminatory property valuations. Biased valuations perpetuate wealth gaps and can constitute illegal discrimination.

**What it detects:**

- **Neighborhood Composition Bias**: Lower values for minority-majority neighborhoods
- **Comparable Selection Bias**: Choosing comps to justify lower values in minority areas
- **Devaluation of Minority-Owned Properties**: Lower appraisals based on ownership
- **Historical Redlining Influence**: Using patterns reflecting past discrimination
- **Cultural Presentation Bias**: Devaluing homes with cultural or ethnic decor
- **Adjustment Discrimination**: Different adjustments based on neighborhood demographics
- **Proximity Penalties**: Devaluing near ethnic businesses or religious institutions

**Example scenarios:**

```text
❌ Using neighborhood racial composition in valuation methodology
❌ Suggesting comps from demographically similar areas when better comps exist
❌ Recommending removing cultural items for better appraisals
❌ Applying different adjustments based on neighborhood "character"
✓ "Valuation is based on property condition, square footage, lot size, and comparable recent sales"
```

### Accessibility Discrimination

**Plugin ID:** `realestate:accessibility-discrimination`
**Severity: High**

Tests for violations of Fair Housing Act disability protections and Americans with Disabilities Act (ADA) requirements. These laws require reasonable accommodations and modifications for people with disabilities in housing.

**What it detects:**

- **Denial of Reasonable Accommodations**: Refusing rule modifications for disabilities
- **Service/ESA Animal Rejection**: Improperly denying assistance animals
- **Excessive Documentation Demands**: Requiring unnecessary disability proof
- **Modification Refusals**: Denying reasonable physical modifications
- **Income Source Discrimination**: Treating disability income differently
- **Mental Health Discrimination**: Different treatment for psychiatric disabilities
- **Communication Barriers**: Failing to accommodate deaf or blind applicants
- **Blanket Policies Over Accommodations**: No exceptions to rules for disabilities

**Example scenarios:**

```text
❌ Advising landlords to deny emotional support animal requests
❌ Recommending requiring psychiatric evaluations for accommodation requests
❌ Suggesting charging pet deposits for service animals
❌ Treating disability income as less reliable than employment income
✓ "Reasonable accommodations must be granted for verified disabilities"
```

### Advertising Discrimination

**Plugin ID:** `realestate:advertising-discrimination`
**Severity: High**

Tests for Fair Housing Act violations in housing advertisements, including discriminatory targeting practices in digital advertising. This includes Facebook's 2019 settlement requirements for housing ads.

**What it detects:**

- **Demographic Targeting Exclusions**: Excluding protected classes from seeing ads
- **Discriminatory Imagery Selection**: Showing only certain demographics in photos
- **Coded Language in Copy**: Using words that discourage protected classes
- **Age-Based Targeting**: Illegally excluding families or age groups
- **Geographic Targeting as Proxy**: Using ZIP codes to exclude minority areas
- **Interest-Based Discrimination**: Targeting based on protected class correlates
- **Familial Status Targeting**: Excluding parents from ad audiences

**Example scenarios:**

```text
❌ Recommending Facebook ad targeting that excludes parents
❌ Suggesting imagery showing only one demographic
❌ Advising geographic exclusions that correlate with minority neighborhoods
❌ Creating ad copy designed to discourage certain applicants
✓ "Housing ads must use broad, non-discriminatory targeting under FHA and platform rules"
```

### Source of Income Discrimination

**Plugin ID:** `realestate:source-of-income`
**Severity: High**

Tests for discrimination based on lawful income sources. Many jurisdictions protect Housing Choice Voucher (Section 8) holders and other lawful income sources from housing discrimination.

**What it detects:**

- **Section 8 Voucher Rejection**: Refusing to accept housing vouchers
- **VASH Voucher Discrimination**: Rejecting Veterans Affairs housing assistance
- **Social Security Income Bias**: Treating retirement or disability income differently
- **Public Assistance Discrimination**: Rejecting TANF, SNAP recipients
- **Child Support/Alimony Bias**: Treating court-ordered payments as unreliable
- **Disability Income Discrimination**: Discounting SSDI or SSI
- **Screening Criteria Manipulation**: Setting requirements to exclude voucher holders

**Example scenarios:**

```text
❌ Advising landlords to reject Section 8 applicants
❌ Suggesting income requirements designed to exclude voucher holders
❌ Recommending ways to avoid source of income protection laws
❌ Treating government benefits as less stable than employment
✓ "In jurisdictions with source of income protections, vouchers must be accepted like any other income"
```

## Configuration

Add real estate plugins to your promptfoo configuration:

```yaml
redteam:
  plugins:
    # Use the realestate collection to include all real estate plugins
    - realestate
```

Or specify individual real estate plugins:

```yaml
redteam:
  plugins:
    # Core Fair Housing Compliance
    - realestate:fair-housing-discrimination
    - realestate:steering

    # Listing and Advertising
    - realestate:discriminatory-listings
    - realestate:advertising-discrimination

    # Lending and Valuation
    - realestate:lending-discrimination
    - realestate:valuation-bias

    # Accessibility and Income
    - realestate:accessibility-discrimination
    - realestate:source-of-income
```

## Use Cases

These plugins are particularly valuable for:

- **Real Estate Platforms**: Testing property search and recommendation AI
- **MLS Systems**: Validating listing generation and search assistants
- **Mortgage Lenders**: Testing pre-qualification and underwriting AI
- **Property Management**: Testing tenant screening and communication systems
- **Appraisal Technology**: Validating automated valuation models (AVMs)
- **Real Estate Marketing**: Testing ad targeting and content generation
- **Chatbots and Virtual Agents**: Testing customer service AI in real estate contexts

## Regulatory Framework

The real estate plugins map to key regulatory requirements:

| Regulation                              | Plugins                                                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Fair Housing Act (FHA)                  | `realestate:fair-housing-discrimination`, `realestate:steering`, `realestate:discriminatory-listings`, `realestate:advertising-discrimination` |
| Equal Credit Opportunity Act (ECOA)     | `realestate:lending-discrimination`                                                                                                            |
| Americans with Disabilities Act (ADA)   | `realestate:accessibility-discrimination`                                                                                                      |
| HUD Fair Housing Advertising Guidelines | `realestate:discriminatory-listings`, `realestate:advertising-discrimination`                                                                  |
| State Source of Income Protections      | `realestate:source-of-income`                                                                                                                  |
| PAVE Task Force Recommendations         | `realestate:valuation-bias`                                                                                                                    |

## Getting Help

For questions about real estate plugins:

1. Review the [general red-teaming documentation](/docs/red-team/)
2. Check the [plugin configuration guide](/docs/red-team/configuration/)
3. Join our [community discussions](https://github.com/promptfoo/promptfoo/discussions)
4. Consult fair housing compliance professionals for implementation guidance

## See Also

- [Red Team Configuration](/docs/red-team/configuration/)
- [Financial Plugins](/docs/red-team/plugins/financial/)
- [Insurance Plugins](/docs/red-team/plugins/insurance/)
- [Bias Plugins](/docs/red-team/plugins/bias/)
