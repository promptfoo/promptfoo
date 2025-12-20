# Timeline: Biden EO 14110 Stack (2023–2024) vs Trump Reversals and Replacements (2025)

## Policy Evolution Timeline

| Date | Document | What It *Actually* Changed | OMB + Procurement Hook |
|------|----------|---------------------------|------------------------|
| **Oct 30, 2023** | **Biden EO 14110** "Safe, Secure, and Trustworthy Development and Use of AI" | Built a federal "risk-management stack" that covered both government use *and* private-sector frontier-model risks. It ordered NIST to produce safety, security, red-teaming, and evaluation guidance (including generative AI companions and benchmarks). ([The White House][1]) It also used the Defense Production Act to require developers of "potential dual-use foundation models" to provide the government information including **ownership/possession of model weights** and **red-team results**, plus reporting on large computing clusters. ([The White House][1]) | EO 14110 explicitly tasked **OMB** with issuing governmentwide guidance for federal AI use and specified that this guidance should cover procurement practices like applying minimum risk-management practices to procured AI, independent evaluation of vendor claims, and contract oversight. ([The White House][1]) |
| **Mar 28, 2024** | **OMB M-24-10** "Advancing Governance, Innovation, and Risk Management for Agency Use of AI" | Operationalized EO 14110 for **agency AI use**. It required agencies to apply minimum practices for "safety-impacting" and "rights-impacting" AI by **Dec 1, 2024**, or stop using the AI until compliant. It also hard-coded due-process style requirements for rights-impacting systems: public notice and plain-language documentation, notification for adverse decisions, appeal info, human consideration/remedy processes, and (where practicable) opt-out mechanisms. | This memo is the "government use" half of the stack. It created obligations that procurement had to support (vendors, documentation, monitoring, remedies). |
| **Sep 24, 2024** | **OMB M-24-18** "Advancing the Responsible Acquisition of AI in Government" | The "procurement half" of the stack. It required agencies to identify contracts associated with rights-impacting/safety-impacting AI and bring them into compliance with M-24-10 by **Dec 1, 2024**. It also pushed solicitation transparency (disclose when a use is rights- or safety-impacting where practicable) and required vendors provide documentation needed to monitor performance and meet M-24-10 requirements. For rights-impacting AI, it explicitly told agencies to surface M-24-10's notice/appeal and human-remedy expectations in requirements documents. | This is where "responsible AI" became **contract language**: disclosure in solicitations, transparency terms, and aligning contracts with the notice/appeal and oversight requirements from M-24-10. |
| **Oct 24, 2024** | **Biden National Security Memorandum on AI** (unclassified) | EO 14110 carved out national security systems from the OMB framework. This memo filled that gap, directing how to harness AI in national security systems while protecting human rights, civil rights/civil liberties, privacy, and safety, and explicitly stated it fulfilled EO 14110's directive. ([The White House][2]) | Not procurement-focused, but it matters because later Trump procurement guidance often excludes **national security systems**. ([The White House][2]) |
| **Jan 20, 2025** | **EO 14110 rescinded** | The core Biden EO was formally rescinded on **Jan 20, 2025**. ([NIST][3]) This matters because EO 14110 was the "parent authority" for much of the 2024 implementation work. | Created the predicate for rewriting the OMB memos that implemented EO 14110. ([NIST][3]) |
| **Jan 23, 2025** (FR pub Jan 31) | **Trump EO 14179** "Removing Barriers to American Leadership in AI" | Formally reframed federal AI policy around **AI dominance** and explicitly positioned "ideological bias / engineered social agendas" as a target. ([Federal Register][4]) Crucially, it ordered an immediate review of "all policies, directives, regulations, orders, and other actions taken pursuant to" the revoked EO 14110 and told agencies to suspend/revise/rescind anything inconsistent with the new policy, with interim exemptions where needed. ([Federal Register][4]) | The EO required OMB to revise **M-24-10 and M-24-18 within 60 days** to align with Trump's policy. ([Federal Register][4]) This is the clean "stack swap": same mechanism (OMB memos), different priorities. |
| **Apr 3, 2025** | **OMB M-25-21** "Accelerating Federal Use of AI through Innovation, Governance, and Public Trust" | Replaced M-24-10. It explicitly says it "rescinds and replaces" M-24-10 and adopts a "forward-leaning and pro-innovation approach" while still claiming safeguards for civil rights/civil liberties/privacy, and explicitly aims to "lessen the burden of bureaucratic restrictions." It switches the core category from "rights-/safety-impacting AI" to **"high-impact AI"** (principal basis for decisions with significant effects on rights or safety). It keeps minimum practices (pre-deployment testing, AI impact assessments, human oversight, discontinuation if noncompliant), but resets timing by requiring agencies to document implementation **within 365 days** of the memo. | Still an OMB-driven governance regime, still tied to CAIO functions and inventories, but now framed around accelerating deployment and reducing internal process drag. |
| **Apr 3, 2025** | **OMB M-25-22** "Driving Efficient Acquisition of AI in Government" | Replaced M-24-18. It explicitly "rescinds and replaces" M-24-18. Its themes push procurement toward: (1) a competitive American AI marketplace and avoiding vendor lock-in via data portability/interoperability, (2) performance tracking and risk management to preserve public trust, and (3) cross-functional engagement. It also makes "buy American" explicit: maximize use of AI products/services developed and produced in the United States (consistent with law). | This is the Trump procurement "reset." The memo re-centers acquisition on competition, speed, and vendor-dependence risk, while keeping privacy compliance requirements. |
| **Jul 23, 2025** (FR pub Jul 28) | **Trump EO 14319** "Preventing Woke AI in the Federal Government" | Turned "trust" into a procurement filter for **LLMs**, explicitly arguing the government should not procure models that "sacrifice truthfulness and accuracy to ideological agendas." ([Federal Register][5]) It created "Unbiased AI Principles" and told agencies to procure only LLMs developed accordingly, and required contract language tying compliance to termination and even shifting decommissioning costs to vendors for noncompliance. ([The White House][6]) It also signals a major reversal from EO 14110's posture on sensitive disclosures: EO 14319 says OMB guidance should allow compliance via system prompt/specs/evals and **avoid requiring disclosure of model weights** where practicable. ([The White House][6]) | This is procurement as culture-war enforcement. It explicitly directs OMB to issue implementing guidance (in consultation with OFPP and GSA). ([The White House][6]) |
| **Dec 11, 2025** | **OMB M-26-04** "Increasing Public Trust in AI Through Unbiased AI Principles" | Implements EO 14319. It reiterates that the EO is about ensuring federally procured LLMs are "free from harmful ideological biases or social agendas," and it enumerates the EO's two "Unbiased AI Principles," including **truth-seeking**. ([The White House][7]) It also clarifies scope: the Unbiased AI Principles apply to **LLMs** except those used in national security systems. ([The White House][8]) It then turns that into procurement process: baseline "LLM transparency requirements" and vendor documentation (policies, technical docs like model/system/data cards, evaluation artifacts, and user resources/feedback channels). ([The White House][8]) | This is the "contract clause playbook" for EO 14319. It plugs into M-25-22's acquisition framework and forces agencies to evaluate LLMs for ideological neutrality/truthfulness as part of buying decisions. ([The White House][8]) |
| **Dec 11, 2025** | **Trump EO** "Ensuring a National Policy Framework for AI" | This is the big 2025 shift from "how the federal government uses AI" to "how the federal government constrains state AI regulation." It: creates an **AI Litigation Task Force** at DOJ to identify/evaluate/take action against state laws that burden AI development/deployment, tasks Commerce with identifying state AI laws that interfere with federal policy, and directs the Attorney General to take steps to stop enforcement of state laws deemed to burden AI. ([The White House][9]) It also directs federal agencies to **restrict federal grant funding** from being used in states with AI laws that burden AI development/deployment. ([The White House][9]) | Not an OMB procurement memo, but it is a federal policy lever with procurement-like effects: it uses federal funding conditions and DOJ enforcement to shape the national regulatory environment for AI. ([The White House][9]) |

---

## What Changed in Practice from 2023 to End-2025

### Continuity: The "Stack" Stayed OMB-Centered

Even after EO 14110 was rescinded, the implementation model largely persisted:

* **Executive order sets policy direction**, then
* **OMB memos operationalize** agency governance and procurement (M-24-10/M-24-18 → M-25-21/M-25-22), then
* **Procurement clauses enforce it** (Biden: rights/safety impact controls; Trump: LLM "unbiased principles"). ([The White House][1])

### Rupture 1: Private-Sector "Frontier Model" Oversight Flipped

* **Biden EO 14110** used federal emergency and commerce authorities to demand information from frontier-model developers, including model weight possession and red-team results. ([The White House][1])
* **Trump's 2025 approach** moved away from that disclosure posture, at least in procurement guidance for LLMs, explicitly telling agencies to avoid requiring disclosure of model weights where practicable. ([The White House][6])

**Net effect:** less "developer reporting to government," more "vendor documentation to buyer" and more emphasis on vendor flexibility. ([The White House][6])

### Rupture 2: "Trustworthy" Changed Meaning

* Under **Biden**, "trustworthy" was anchored in safety/security evaluation, civil rights, and due-process style protections (notice, appeal, opt-out) for rights-impacting systems.
* Under **Trump**, "trustworthy" became explicitly tied to *truth-seeking and ideological neutrality*, framed as preventing "woke" or DEI-driven behavior in federally procured LLMs. ([Federal Register][5])

### Continuity with Modification: Agency AI Governance Did Not Disappear

Trump's M-25-21 keeps a minimum-practices regime for "high-impact" AI and still says noncompliant high-impact AI should be discontinued until compliant.

But it reframes the posture: pro-innovation and reducing bureaucratic burden, while still asserting safeguards for civil rights/civil liberties/privacy.

### Rupture 3: Federalism Became a Front-Line AI Policy Tool

EO 14110 was a whole-of-government risk framework, but it did not build an explicit federal machine to challenge state AI laws.

Trump's **Dec 11, 2025 EO** does exactly that via DOJ litigation posture and federal funding conditions, signaling that "national framework" and preemption strategy are now core executive-branch AI policy, not just agency operations. ([The White House][9])

---

## Quick "Continuity and Rupture" One-Liners

**Continuity:**
> "Both administrations used OMB memos as the real policy engine: EO sets direction, OMB sets requirements, procurement embeds them." ([Federal Register][4])

**Rupture:**
> "Biden demanded frontier-model reporting (including weights possession and red-team results); Trump's procurement policy explicitly avoids weight disclosure and instead screens LLMs for ideological neutrality." ([The White House][1])

**Rupture:**
> "2025 adds federal preemption posture: DOJ task force plus grant funding leverage against state AI laws." ([The White House][9])

---

## Additional News Coverage

- [Reuters: US mandate AI vendors measure political bias for federal sales](https://www.reuters.com/world/us/us-mandate-ai-vendors-measure-political-bias-federal-sales-2025-12-11/?utm_source=chatgpt.com)
- [Reuters: White House will work with Congress on single framework for AI](https://www.reuters.com/world/white-house-will-work-with-congress-single-framework-ai-adviser-says-2025-12-12/?utm_source=chatgpt.com)
- [Axios: White House 'woke AI' guidance for federal agencies](https://www.axios.com/2025/12/11/white-house-woke-ai-guidance-federal-agencies?utm_source=chatgpt.com)

---

## References

[1]: https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2023/10/30/executive-order-on-the-safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence/ "Executive Order on the Safe, Secure, and Trustworthy Development and Use of Artificial Intelligence | The White House"
[2]: https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2024/10/24/memorandum-on-advancing-the-united-states-leadership-in-artificial-intelligence-harnessing-artificial-intelligence-to-fulfill-national-security-objectives-and-fostering-the-safety-security/?utm_source=chatgpt.com "Memorandum on Advancing the United States' Leadership ..."
[3]: https://www.nist.gov/artificial-intelligence/executive-order-safe-secure-and-trustworthy-artificial-intelligence "Executive Order on Safe, Secure, and Trustworthy Artificial Intelligence | NIST"
[4]: https://www.federalregister.gov/documents/2025/01/31/2025-02172/removing-barriers-to-american-leadership-in-artificial-intelligence "Federal Register :: Removing Barriers to American Leadership in Artificial Intelligence"
[5]: https://www.federalregister.gov/documents/2025/07/28/2025-14217/preventing-woke-ai-in-the-federal-government "Federal Register :: Preventing Woke AI in the Federal Government"
[6]: https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/ "Preventing Woke AI in the Federal Government – The White House"
[7]: https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf?utm_source=chatgpt.com "Increasing Public Trust in Artificial Intelligence Through ..."
[8]: https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf "Increasing Public Trust in Artificial Intelligence Through Unbiased AI Principles"
[9]: https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/ "Ensuring a National Policy Framework for Artificial Intelligence – The White House"
