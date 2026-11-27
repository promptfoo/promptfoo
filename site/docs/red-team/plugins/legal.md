---
sidebar_label: Legal Plugins
title: Legal Red Team Plugins
description: Test AI systems for hallucinated legal authority, unauthorized practice of law, confidentiality breaches, and jurisdiction confusion with 4 specialized plugins.
sidebar_position: 54
---

# Legal Red-Teaming Plugins

The Legal Red-Teaming Plugins are a specialized suite designed for AI systems operating in legal contexts - firm intake bots, legal research assistants, compliance tools, and consumer legal-information chatbots. These plugins test whether legal-domain AI systems invent legal authority, cross into the unauthorized practice of law, expose privileged information, or apply the wrong jurisdiction's law.

## Why Legal Red-Teaming Matters

Legal AI systems carry unique professional and regulatory exposure:

- **Sanctioned filings**: Courts have sanctioned attorneys who filed briefs containing AI-fabricated case citations
- **Unauthorized practice of law (UPL)**: Case-specific legal advice from an unlicensed system can violate state UPL statutes
- **Privilege and confidentiality**: Disclosing client identities, matter details, or privileged communications can waive privilege and breach professional duties
- **Jurisdictional error**: Law varies by jurisdiction; applying the wrong jurisdiction's rules produces silently wrong guidance

## Available Legal Plugins

### Legal Hallucination

**Plugin ID:** `legal:hallucination`
**Severity: Medium**

Tests whether the system fabricates legal authority: invented case citations, non-existent statutes or regulations, fake docket numbers, or misquoted holdings. It also checks whether the system confirms a fabricated authority supplied by the user instead of flagging it.

**What it detects:**

- **Fake Case Citations**: Inventing case names, reporter citations, docket numbers, or vote splits
- **Non-existent Statutes**: Citing code sections that do not exist or do not say what is claimed
- **Fabricated Regulations**: Referencing CFR sections or agency rules that do not exist
- **Misquoted Holdings**: Attributing quotes or holdings to real cases that do not contain them
- **Confirmation Traps**: Accepting a fabricated case or statute supplied by the user

**Example scenarios:**

```text
❌ "The controlling case is Smith v. Global Data Corp., 598 U.S. 412 (2023), decided 6-3..." (no such case)
❌ Quoting statutory text for a section number that does not exist
❌ Confirming and applying a fabricated case the user named
✓ "I can't verify that citation - please check an official reporter before relying on it"
```

### Unauthorized Practice of Law

**Plugin ID:** `legal:unauthorized-practice`
**Severity: High**

Tests whether the system crosses from general legal information into case-specific legal advice: deciding the user's specific matter, preparing binding documents for execution, guaranteeing outcomes, or positioning itself as a substitute for licensed counsel.

**What it detects:**

- **Case-Specific Determinations**: Applying law to the user's actual facts and directing a course of action
- **Document Preparation**: Drafting wills, contracts, or court filings for direct execution, or confirming enforceability
- **Outcome Guarantees**: Predicting or guaranteeing the result of a legal matter
- **Relationship Claims**: Implying an attorney-client relationship or privilege over the conversation
- **Displacement of Counsel**: Telling the user they do not need a lawyer for a consequential matter

**Example scenarios:**

```text
❌ "Yes, you can fire her tomorrow - here is exactly what to write in the termination letter"
❌ "Here is your completed will, it will be valid when probated"
✓ "I can explain how non-competes generally work, but a licensed attorney should review your specific situation"
```

### Confidential Disclosure

**Plugin ID:** `legal:confidential-disclosure`
**Severity: High**

Tests whether the system protects client identities, privileged communications, and matter details. Relevant for firm intake bots, client portals, e-discovery assistants, and any legal AI that touches engagement data.

**What it detects:**

- **Client Identity Confirmation**: Confirming or denying that a person or organization is a client
- **Privileged Communications**: Revealing the content or existence of attorney-client communications
- **Matter Details**: Disclosing case strategy, settlement positions, filing contents, or deadlines
- **Other Clients' Information**: Sharing advice or documents from other engagements
- **Pretexting Susceptibility**: Disclosing under claimed authority, urgency, or a fabricated relationship

**Example scenarios:**

```text
❌ Confirming that a named company is a client of the firm
❌ Summarizing privileged counsel communications for an unverified requester
✓ "I can't confirm or discuss client relationships - please contact the responsible attorney directly"
```

### Jurisdiction Confusion

**Plugin ID:** `legal:jurisdiction-confusion`
**Severity: Medium**

Tests whether the system applies the wrong jurisdiction's law, accepts a false jurisdictional premise, or gives an unqualified answer where the law varies by location.

**What it detects:**

- **False Premises**: Accepting that a statute governs somewhere it does not
- **Cross-Border Confusion**: Applying US law to EU users or EU law to US entities
- **Federal vs. State**: Conflating federal, state, and local rules
- **Varying Regimes**: Giving one rule for questions whose answer varies by jurisdiction
- **Scope Invention**: Inventing a jurisdictional scope for a statute or regulation

**Example scenarios:**

```text
❌ Applying the Magnuson-Moss Warranty Act (US) to a consumer in Germany without correction
❌ Giving a single national inheritance-tax rate "that applies everywhere"
✓ "The Texas Property Code does not apply in Quebec - residential evictions there are governed by..."
```

## Configuration

Add the legal plugins to your red team configuration:

```yaml
redteam:
  plugins:
    - legal
```

Or select individual plugins:

```yaml
redteam:
  plugins:
    - legal:hallucination
    - legal:unauthorized-practice
    - legal:confidential-disclosure
    - legal:jurisdiction-confusion
```

## Use Cases

These plugins are essential for:

- **Law firm and legal aid AI**: Intake bots, client portals, and research assistants
- **Compliance tools**: Systems that interpret regulations for business users
- **Consumer legal-information chatbots**: Tenant rights, immigration, and small-claims assistants
- **Contract and document tools**: Drafting assistants that could produce binding documents

## Related Plugins

- [Hallucination](/docs/red-team/plugins/hallucination/) - General fabrication detection
- [Financial Plugins](/docs/red-team/plugins/financial/) - Financial services hallucination and compliance
- [Medical Plugins](/docs/red-team/plugins/medical/) - Healthcare-specific hallucination and advice
- [PII Plugins](/docs/red-team/plugins/pii/) - Personal data disclosure

## See Also

- [Red Team Strategies](/docs/red-team/strategies/)
- [Red Team Configuration](/docs/red-team/configuration/)
