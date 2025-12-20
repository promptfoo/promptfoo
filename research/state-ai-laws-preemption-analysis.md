# State and Local AI Laws Most Exposed to Federal Preemption

The December 11, 2025 AI Executive Order (EO) sets up a federal strategy to *identify, challenge, and potentially preempt* state and local AI requirements that (1) "require AI models to alter truthful outputs," and/or (2) compel "disclos[ures] or report[ing]" in ways the EO flags as potential First Amendment or other constitutional problems. It also directs DOJ to form an AI litigation task force, and directs the FCC to begin a proceeding to create a federal reporting and disclosure standard that would preempt conflicting state requirements. ([The White House][1])

Below is a fact-grounded "patchwork" table of the state and local laws and major proposals that most clearly intersect with those EO targets.

---

## State and Local AI Laws Patchwork Table

| Jurisdiction and Law (Status) | What They Regulate | Mandate Type (Output Changes, Audits, Disclosures) | Why They Could Conflict with the EO | Why It Matters for "Patchwork" |
|-------------------------------|-------------------|---------------------------------------------------|-------------------------------------|-------------------------------|
| **Colorado: SB24-205 "Consumer Protections for AI"** (enacted 2024; compliance date delayed to **June 30, 2026** by SB25B-004) | "High-risk" AI used in **consequential decisions** (employment, housing, credit, etc.) and consumer-facing AI interactions. Developers and deployers must use "reasonable care" to prevent **algorithmic discrimination** and meet detailed documentation, assessment, and consumer-rights obligations. | **Output changes:** not explicit, but *mitigation of algorithmic discrimination* can force changes to scoring/decision outputs. **Audits/assessments:** impact assessments + annual reviews for deployers. **Disclosures:** consumer notice, public statements, and AG disclosures. | The EO explicitly uses a "new Colorado law banning algorithmic discrimination" as a core example of a state requirement that could push AI to produce "false results" to avoid differential impact, which is the EO's stated preemption target ("alter truthful outputs"). ([The White House][1]) | Creates one of the broadest cross-sector AI compliance programs in the US (documentation to deployers, impact assessments, consumer notices, appeal rights), raising the cost of national rollouts and increasing the risk of inconsistent standards across states. ([The White House][1]) |
| **California: SB 53 "Transparency in Frontier AI Act"** (signed **Sep 29, 2025**) ([LegiScan][2]) | **Large frontier AI developers** (coverage tied in part to scale, including models with very high training spend; reporting centers on catastrophic-risk governance). Requires publishing a safety/security framework and transmitting **catastrophic risk assessment summaries** to the California Office of Emergency Services; sets up critical incident reporting mechanisms and includes whistleblower protections and civil penalties. ([LegiScan][2]) | **Output changes:** no. **Audits/assessments:** catastrophic risk assessments (and summaries). **Disclosures/reporting:** public disclosure of safety framework + regulator reporting + incident reporting channel. ([LegiScan][2]) | Falls squarely into the EO's "reporting/disclosure" preemption track (Commerce evaluation + FCC federal disclosure standard). The EO specifically calls out compelled disclosures as a category it wants to scrutinize for constitutional conflicts and to harmonize federally. ([The White House][1]) | Adds a California-specific transparency and incident-reporting layer for frontier model providers, which can diverge from federal or international governance practices and complicate "single standard" safety programs. ([LegiScan][2]) |
| **California: AB 2013 "Training Data Transparency Act"** (enacted 2024; disclosures due **on/before Jan 1, 2026**) | Developers of **generative AI systems** must post documentation on their website with a **high-level summary of the training datasets** used (including dataset sources and other specified information). | **Output changes:** no. **Audits:** no. **Disclosures:** yes, required public training-data documentation. | This is a clean match for the EO's "compelled disclosure/reporting" category that the EO tells Commerce to identify and that the FCC may federalize (and preempt) through a uniform standard. ([The White House][1]) | Forces a distinct "California disclosure schema" for training data summaries, which can collide with trade-secret concerns, IP strategies, and any future federal disclosure template. ([The White House][1]) |
| **California: SB 942 "California AI Transparency Act"** (enacted 2024; **amended by AB 853** to delay core requirements to **Aug 2, 2026**) | "Covered providers" of GenAI systems with large user bases must provide a **free AI detection tool** and offer **manifest disclosure** options for GenAI-created/altered content; later amendments expand provenance duties for platforms and other entities on later dates. | **Output changes:** potentially yes (embedding provenance/latent disclosures; offering manifest disclosures). **Audits:** no. **Disclosures:** yes (tooling + labeling/provenance-related requirements). | The EO's FCC directive aims at a federal reporting/disclosure standard that preempts conflicting state schemes. SB 942 is exactly the type of "content provenance / disclosure tooling" requirement that could be swept into a federal uniform rule. ([The White House][1]) | Providers face a "tooling and labeling" compliance layer that is unique in scope and definitions, creating re-engineering and UX fragmentation across states (especially if other states adopt different provenance specs). ([The White House][1]) |
| **NYC: Local Law 144 (AEDTs in employment)** (in effect; enforcement began **July 5, 2023**) ([Office of the New York State Comptroller][3]) | Employers and employment agencies using **automated employment decision tools** for hiring/promotion must obtain an **independent bias audit**, provide notice to candidates/employees, and publish a summary of audit results. ([Office of the New York State Comptroller][3]) | **Output changes:** no (but audit results can pressure changes). **Audits:** yes (bias audit). **Disclosures:** yes (notice + posting). ([Office of the New York State Comptroller][3]) | Strong overlap with the EO's "disclosure" scrutiny and potential federal standardization (especially if federal agencies define a different audit or reporting regime for employment-related AI). ([The White House][1]) | A city-level rule adds a separate audit and notice cadence layered on top of state and federal employment law, which is exactly the operational "patchwork" problem for nationwide HR tooling. ([Office of the New York State Comptroller][3]) |
| **Texas: HB 149 "TRAIGA"** (enacted; effective **Jan 1, 2026**) | Comprehensive AI law with an **intent-based** prohibited-practices framework (manipulation to incite harm, discriminatory intent, certain rights violations), a regulatory sandbox, AG enforcement, and local preemption. Many provisions focus on government uses; it also includes consumer-facing disclosure for government AI systems interacting with consumers. | **Output changes:** could be implicated (eg, constraints around political viewpoint discrimination and moderation practices). **Audits:** no. **Disclosures:** yes (government must disclose AI interaction). | TRAIGA is less "audit/disclosure-heavy" than Colorado/California, but it still intersects the EO's disclosure lane (federal reporting/disclosure standard could preempt state notice rules) and could be evaluated as part of the EO's "onerous state AI law" review process. ([The White House][1]) | Adds another statewide definition set (developer/deployer, prohibited uses, safe harbors) that companies must map against other states' definitions. This raises compliance complexity even when rules are narrower than CO/CA. ([The White House][1]) |
| **Utah: SB 149 "UAIPA" + 2025 amendments (SB 226/SB 332)** (effective **May 1, 2024**; amendments effective **May 7, 2025**) | Consumer protection focused rules for **GenAI chatbot interactions**, including disclosure when a consumer clearly asks if they are interacting with AI, and "high-risk" disclosure duties for regulated occupations (eg, sensitive personal info + advice that could drive significant decisions). Also confirms AI is not a defense to consumer protection violations. | **Output changes:** no. **Audits:** no. **Disclosures:** yes (chatbot/interaction disclosure; safe harbor based on robust disclosure). | A direct overlap with the EO's "federal disclosure standard" concept: Utah imposes its own trigger conditions and formatting expectations for disclosures that a federal standard could override. ([The White House][1]) | Demonstrates how even "lightweight" disclosure laws vary on triggers (asked vs always, high-risk definition), which forces product teams to implement jurisdiction-specific flows. ([The White House][1]) |
| **Illinois: Artificial Intelligence Video Interview Act** (active; enacted **Aug 9, 2019**) | Employers using AI analysis of video interviews must **notify** applicants, **explain** how the AI works and what characteristics it uses, obtain **consent**, restrict disclosure of videos, and delete copies within 30 days of an applicant request. | **Output changes:** no. **Audits:** no. **Disclosures:** yes (notice/explanation/consent). | Again falls into the EO's "compelled disclosure" bucket, and would be exposed if the FCC or other federal agencies create a conflicting national disclosure baseline for AI-enabled hiring tools. ([The White House][1]) | Another distinct employment-related disclosure/consent regime, separate from NYC's audit model and Colorado's broad "high-risk system" model, increasing fragmentation for hiring vendors. ([The White House][1]) |
| **New York State: S6953A ("RAISE Act" style frontier-model proposal)** (major proposal, 2025) | Would impose frontier-model obligations on "large AI model" developers, including **third-party audits** and rapid **safety incident reporting** (the text excerpt referenced disclosure to the Attorney General within 72 hours and compute/training spend thresholds). | **Output changes:** not the focus. **Audits:** yes (third-party). **Disclosures/reporting:** yes (incident reporting + threshold disclosures). | It is nearly a "textbook" fit for what the EO says it intends to identify and preempt: state-imposed audits and disclosures on large model developers, with constitutional scrutiny and eventual federal standardization. ([The White House][1]) | If enacted, it would add a second major "frontier-model governance stack" beyond California's, with different thresholds, timelines (72-hour reporting), and audit formats. ([The White House][1]) |
| **Florida: proposed "AI Bill of Rights" and insurance-claims AI limits** (major proposals, late 2025) | Proposed rules to restrict AI in insurance claims workflows (eg, AI not as sole basis for adjusting/denying a claim), require disclosures, and empower state review of AI models/practices in insurance. | **Output changes:** could require decision pipeline changes (human in the loop). **Audits:** possible regulator review. **Disclosures:** yes. | Even if sector-specific, these proposals run into the EO's "federal disclosure standard" lane and the "onerous state law" review posture, especially if federal agencies assert primacy over AI reporting/disclosure. ([The White House][1]) | Shows how sector regulators (insurance) can generate their own AI compliance regimes, adding to the patchwork beyond "general AI acts." ([The White House][1]) |

---

## Preemption Likelihood Analysis

### Laws Most Likely to Be Directly Pressured

The laws most likely to be directly pressured by EO-driven preemption are the ones that are:

1. **Cross-sector AI governance frameworks** with audits/assessments and discrimination mitigation duties
   - Colorado SB24-205 is singled out by the EO ([The White House][1])

2. **Frontier-model governance disclosure/reporting** regimes
   - CA SB 53 ([LegiScan][2])
   - NY S6953A proposal ([The White House][1])

3. **Content provenance / detection / labeling** mandates
   - CA SB 942 as amended ([The White House][1])

4. **Employment AI audits and notices**
   - NYC LL144 — explicit, prescriptive "audit + disclose" structures ([Office of the New York State Comptroller][3])

### Important Caveat: EO Does Not Automatically Nullify State Law

An EO does not automatically nullify state law. The mechanism here is:

1. **Litigation** — DOJ task force challenges in court
2. **Agency action** — FTC/FCC rulemaking and policy statements
3. **Federal legislation** — Congress expressly preempts state rules

---

## Mandate Type Summary

| Law | Output Changes | Audits/Assessments | Disclosures/Reporting |
|-----|----------------|-------------------|----------------------|
| Colorado SB24-205 | Indirect (discrimination mitigation) | Yes | Yes |
| California SB 53 | No | Yes | Yes |
| California AB 2013 | No | No | Yes |
| California SB 942 | Potentially (provenance embedding) | No | Yes |
| NYC LL144 | No | Yes | Yes |
| Texas HB 149 | Potentially | No | Yes |
| Utah SB 149 | No | No | Yes |
| Illinois Video Interview Act | No | No | Yes |
| NY S6953A (proposal) | No | Yes | Yes |
| Florida proposals | Potentially | Potentially | Yes |

---

## Key Takeaway

The "patchwork" argument is not rhetoric—it is grounded in the reality that companies deploying AI nationally must navigate:

- **Different definitions** of "high-risk," "deployer," "developer," and "consequential decision"
- **Different trigger conditions** for disclosure (always vs. on request vs. high-risk only)
- **Different audit requirements** (bias audits, impact assessments, third-party reviews)
- **Different reporting timelines** (72 hours, annual, on-demand)
- **Different enforcement bodies** (state AGs, city agencies, sector regulators)

The Dec 2025 EO's preemption strategy is designed to collapse this variation into federal standards—but the mechanism (litigation + agency action + potential legislation) means the patchwork will persist during the transition period.

---

## References

[1]: https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/ "Ensuring a National Policy Framework for Artificial Intelligence – The White House"
[2]: https://legiscan.com/CA/text/SB53/id/3271094 "Bill Text: CA SB53 | 2025-2026 | Regular Session | Chaptered | LegiScan"
[3]: https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools?utm_source=chatgpt.com "Enforcement of Local Law 144 - New York State Comptroller"
