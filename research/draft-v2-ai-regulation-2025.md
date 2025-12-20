# How AI Regulation Changed in 2025

This is a summary of what happened in AI policy in 2025 and what's scheduled for 2026. It's written for people who build AI systems and need to understand the compliance landscape.

---

## The U.S. Federal Picture

### The Policy Transition

The Biden administration's AI framework (EO 14110, October 2023) was rescinded on January 20, 2025. The Trump administration issued replacement orders and guidance throughout the year.

**What got replaced:**

| Biden-Era | Trump-Era | Key Difference |
|-----------|-----------|----------------|
| EO 14110 (Oct 2023) | EO 14179 (Jan 2025) | Removed DPA reporting requirements for frontier model developers |
| OMB M-24-10 (Mar 2024) | OMB M-25-21 (Apr 2025) | Changed "rights-impacting/safety-impacting" to "high-impact"; extended compliance timeline to 365 days |
| OMB M-24-18 (Sep 2024) | OMB M-25-22 (Apr 2025) | Added "buy American" emphasis; reduced prescriptiveness |

Both frameworks use the same implementation mechanism: executive order sets direction, OMB memo operationalizes it, procurement embeds it in contracts.

### What Remained Consistent

Despite the transition, federal AI governance retained several structural elements:

- **Minimum practices for high-risk AI.** M-25-21 still requires pre-deployment testing, impact assessments, human oversight, and discontinuation of non-compliant high-impact AI.
- **Procurement as enforcement.** Agencies still must include AI governance requirements in contracts. Vendors still need documentation to sell to the government.
- **Agency AI inventories.** Agencies must still maintain and publish inventories of AI use cases.

### December 2025: Federal Preemption Strategy

On December 11, 2025, a new executive order established a federal strategy to challenge state AI laws. Key provisions:

**DOJ AI Litigation Task Force** (Section 3): Must be established within 30 days. Charged with challenging state AI laws that "conflict with" federal policy, including on preemption, interstate commerce, and constitutional grounds.

**Commerce Evaluation** (Section 4): Within 90 days, Commerce must publish an evaluation identifying state laws that:
- Require AI models to "alter their truthful outputs"
- Compel disclosure in ways that may violate the First Amendment

**Funding Conditions** (Section 5): Agencies may condition discretionary grants on states not enforcing identified AI laws during the grant period.

**FCC Proceeding** (Section 6): Within 90 days of Commerce's evaluation, the FCC must initiate a proceeding on whether to adopt a federal disclosure standard that would preempt state requirements.

**FTC Policy Statement** (Section 7): Within 90 days, the FTC must issue a statement explaining when state laws requiring "alterations to truthful outputs" are preempted by Section 5 of the FTC Act.

**Legislative Recommendation** (Section 8): Calls for a federal framework that would preempt conflicting state laws, with carve-outs for child safety, state procurement, and data center infrastructure.

Source: [Executive Order, December 11, 2025](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/)

### LLM-Specific Requirements

Separately, federal procurement of large language models now has specific requirements.

**EO 14319 (July 2025)** established "Unbiased AI Principles" for federally procured LLMs:
- **Truth-seeking:** LLMs must be "truthful" when responding to factual queries, prioritize accuracy, and acknowledge uncertainty
- **Ideological neutrality:** LLMs should not encode partisan judgments into outputs unless prompted

**OMB M-26-04 (December 2025)** implements these principles:
- Agencies must update procurement policies by **March 11, 2026**
- Solicitations must request: acceptable use policy, model/system/data cards, evaluation artifacts, and user feedback mechanisms
- Contracts must include requirements tied to the principles

Source: [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf)

---

## The State Picture

### Active Laws

| State | Law | Requirements | Compliance Date |
|-------|-----|--------------|-----------------|
| **Colorado** | SB24-205 | Impact assessments, algorithmic discrimination prevention, consumer notices for high-risk AI | June 30, 2026 (delayed from 2025) |
| **California** | SB 53 | Frontier model safety frameworks, catastrophic risk assessments, incident reporting | Signed September 2025 |
| **California** | AB 2013 | Training data transparency (public documentation of datasets) | January 1, 2026 |
| **California** | SB 942 | AI detection tools, content provenance | August 2, 2026 (delayed) |
| **NYC** | Local Law 144 | Independent bias audits, candidate notice for automated employment decision tools | In effect since July 2023 |
| **Texas** | HB 149 (TRAIGA) | Prohibited practices framework, regulatory sandbox, government AI disclosure | January 1, 2026 |
| **Utah** | SB 149 + amendments | Chatbot disclosure on request, high-risk interaction disclosure | In effect |
| **Illinois** | Video Interview Act | Notice, explanation, and consent for AI video analysis in hiring | In effect |

### Laws Most Likely Affected by Federal Preemption Strategy

The December 2025 EO specifically names Colorado's algorithmic discrimination provisions as an example of state overreach. Based on the EO's criteria, laws most likely to face federal challenge are those that:

1. **Mandate output modifications** for fairness or anti-discrimination purposes
2. **Require disclosures** that could be characterized as compelled speech
3. **Impose audit or assessment requirements** beyond federal standards

Laws in the EO's explicit carve-outs (child safety, state procurement) are less exposed.

### State Response

On December 9, 2025, a coalition of state Attorneys General sent letters to major AI companies requesting:
- Pre-release safety testing for harmful outputs
- Independent third-party audits
- Incident logging and response timelines
- User notification when exposed to identified harms

On November 25, 2025, state AGs sent a letter to Congress opposing federal preemption of state AI consumer protection laws.

Sources: [Reuters on AG letters](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/), [Reuters on preemption opposition](https://www.reuters.com/legal/litigation/dozens-state-attorneys-general-urge-us-congress-not-block-ai-laws-2025-11-25/)

---

## International Context

### China

China's AI governance operates through a filing-and-labeling system rather than the litigation-and-procurement model used in the U.S.

**Filing requirements:**
- Generative AI services with "public opinion attributes" must complete security assessment and algorithm filing
- As of November 2025: 611 registered generative AI services, 306 registered apps

**Labeling requirements (effective September 1, 2025):**
- AI-generated content requires explicit labels (visible to users) and implicit labels (embedded in metadata)
- Metadata must include: content attributes, provider identification, content number
- Platforms must verify metadata and label accordingly
- Six-month log retention required
- Label tampering prohibited

Source: [CAC Labeling Measures](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm), [CSET translation of safety requirements](https://cset.georgetown.edu/wp-content/uploads/t0588_generative_AI_safety_EN.pdf)

### EU

The EU AI Act passed in 2024. Implementation timeline:

- **February 2025:** Prohibited AI practices in effect
- **August 2025:** General-purpose AI model provisions in effect
- **August 2026:** High-risk AI system requirements begin

---

## Technical Context

### 2025 Model Capabilities Relevant to Compliance

| Model | Relevant Capability |
|-------|---------------------|
| GPT-5 / GPT-5.2 | Multi-step tool use (dozens of chained calls); context compaction |
| Claude 4 | Extended thinking with interleaved tool use; tool discovery at scale |
| Gemini 3 | 1M token context; agentic access (editor, terminal, browser) |
| Llama 4 Scout | 10M token context |
| DeepSeek V3.2 | Tool use integrated with reasoning |

**Compliance implication:** Regulations written for single-turn text generation may not capture the behavior of systems that use tools, maintain long context, or take actions in external environments. Testing requirements need to account for this.

### Security Considerations

The UK NCSC published guidance noting that prompt injection differs from traditional injection attacks because LLMs don't enforce a clean boundary between instructions and data. OWASP lists prompt injection as LLM01 in its Top 10 for LLM Applications.

For systems that read untrusted input (web pages, user documents, tool outputs), output integrity is a security property, not just an alignment property.

Sources: [NCSC](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection), [OWASP](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

---

## 2026 Timeline

### Q1 2026

| Date | Event |
|------|-------|
| ~January 10 | DOJ AI Litigation Task Force must be established (30 days from Dec 11 EO) |
| January 1 | California AB 2013 (training data transparency) effective |
| January 1 | Texas HB 149 effective |
| ~March 11 | Commerce evaluation of state AI laws due (90 days from Dec 11 EO) |
| March 11 | Agencies must update LLM procurement policies per M-26-04 |

### Q2 2026

| Date | Event |
|------|-------|
| ~June 11 | FCC proceeding on federal disclosure standard must be initiated |
| ~June 11 | FTC policy statement on "truthful outputs" preemption due |
| June 30 | Colorado SB24-205 compliance date |

### Q3+ 2026

| Date | Event |
|------|-------|
| August 2 | California SB 942 (AI detection tools) effective |
| August 2026 | EU AI Act high-risk requirements begin phasing in |
| TBD | TAKE IT DOWN Act compliance (notice-and-removal processes) |

---

## Implications for Builders

### Documentation Requirements Are Increasing

Federal procurement now requires:
- Model cards, system cards, or data cards
- Evaluation artifacts
- Acceptable use policies
- User feedback mechanisms

State laws require:
- Impact assessments (Colorado)
- Bias audits (NYC)
- Training data documentation (California AB 2013)

Whether or not specific requirements survive preemption challenges, the trend toward documented testing and assessment is consistent across jurisdictions.

### Testing Needs to Cover Systems, Not Just Models

Regulatory frameworks increasingly focus on "use cases" and "deployments" rather than model capabilities. Impact assessments, incident reporting, and audit requirements apply to deployed systems—including prompts, tools, retrieval, and context management.

Benchmarking a base model doesn't satisfy these requirements. Testing needs to evaluate the system as deployed.

### Uncertainty Is the Near-Term Condition

The federal-state conflict is unresolved. The preemption litigation hasn't happened yet. The FCC proceeding hasn't concluded. International requirements continue to diverge.

Building compliance infrastructure that can adapt to different requirements is more practical than optimizing for any single regulatory regime.

---

## Our Perspective

We build Promptfoo because teams need to test AI systems—not just run benchmarks on models.

The regulatory developments in 2025 reinforced something we already believed: if you're shipping AI systems, you need to be able to answer basic questions about how they behave. Not because regulators require it (though increasingly they do), but because that's how you build systems that work.

The testing infrastructure that lets you iterate confidently is the same infrastructure that produces compliance evidence. We think both purposes are better served by treating testing as a continuous engineering practice rather than a launch gate or audit exercise.

If you're navigating these requirements and have questions about what to test or how to document it, we're happy to talk.

---

## Sources

### U.S. Federal
- [December 2025 Preemption EO](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/)
- [EO 14319 (July 2025)](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/)
- [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf)
- [EO 14179 (January 2025)](https://www.federalregister.gov/documents/2025/01/31/2025-02172/removing-barriers-to-american-leadership-in-artificial-intelligence)
- [Biden EO 14110](https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2023/10/30/executive-order-on-the-safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence/)

### State
- [Colorado SB24-205](https://leg.colorado.gov/bills/sb24-205)
- [California SB 53](https://legiscan.com/CA/text/SB53/id/3271094)
- [NYC LL144 Enforcement](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools)

### International
- [China AIGC Labeling Measures](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm)
- [CSET: Basic Safety Requirements Translation](https://cset.georgetown.edu/wp-content/uploads/t0588_generative_AI_safety_EN.pdf)

### Technical
- [NCSC: Prompt Injection](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection)
- [OWASP Top 10 for LLMs](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

### News
- [Reuters: Trump AI Order Hurdles](https://www.reuters.com/legal/government/trumps-ai-order-faces-political-legal-hurdles-2025-12-12/)
- [Reuters: State AG Letters](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/)
