# How AI Regulation Changed in 2025

If you sell AI to the federal government, you have until March 2026 to provide documentation you probably don't have yet. [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf), issued in December, requires agencies purchasing large language models to request model cards or system cards, evaluation artifacts, acceptable use policies, and user feedback mechanisms.

That's one deadline. California's training data transparency law takes effect January 1. Colorado's algorithmic discrimination requirements arrive June 30. The EU's high-risk AI system rules begin phasing in next August.

This post covers what changed in 2025 and what's scheduled for 2026, written for people building AI systems who need to understand the compliance landscape.

---

## How Regulation Reaches Your Product

In practice, AI regulation flows through a stack:

**Executive policy** (EOs, national strategies)
→ **Agency guidance** (OMB memos, regulator statements)
→ **Procurement requirements** (RFP language, vendor questionnaires)
→ **Contract clauses** (warranties, reporting obligations, audit rights)
→ **Evidence** (eval reports, incident logs, documentation packets)

This is why 2025 mattered: the stack filled in. Executive orders issued years ago became OMB memos, which became procurement language, which became contract requirements, which became requests for evidence that vendors need to produce.

If you've received a security questionnaire asking about your AI systems, or seen new sections in an RFP about model documentation, you've felt this stack.

---

## US Federal Policy

### The January Transition

The Biden administration issued [Executive Order 14110](https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2023/10/30/executive-order-on-the-safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence/) in October 2023, creating categories for "rights-impacting" and "safety-impacting" AI, requiring federal agencies to implement risk-management practices, and using the Defense Production Act to compel reporting from developers of large models. That order was rescinded on January 20, 2025. [Executive Order 14179](https://www.federalregister.gov/documents/2025/01/31/2025-02172/removing-barriers-to-american-leadership-in-artificial-intelligence) replaced it three days later.

The implementation mechanism stayed the same: executive order sets direction, OMB memo operationalizes it, procurement office embeds requirements in contracts. What changed:

| | Before | After |
|--|--------|-------|
| Terminology | "Rights-impacting AI" | "High-impact AI" |
| Compliance timeline | Immediate | 365 days |
| Frontier model reporting | Required under DPA | Removed |
| Overall posture | Risk management | Innovation promotion |

What didn't change: pre-deployment testing requirements for high-risk AI, impact assessments, human oversight expectations, agency AI inventories, and the expectation that vendors provide documentation.

### July: LLM Procurement Requirements

[Executive Order 14319](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/) added requirements specific to large language models, establishing two "Unbiased AI Principles":

> **Truth-seeking:** LLMs should provide accurate responses to factual queries and acknowledge uncertainty when appropriate.
>
> **Ideological neutrality:** LLMs should not encode partisan viewpoints into outputs unless specifically prompted.

The December OMB memo implementing these principles specifies what agencies must request:

| Artifact | Description |
|----------|-------------|
| Model/system/data cards | Documentation of training, capabilities, limitations |
| Evaluation artifacts | Results from testing |
| Acceptable use policy | What the system should and shouldn't do |
| Feedback mechanism | How users report problematic outputs |

Agencies must update their procurement policies by **March 11, 2026**. The engineering implication: model behavior is now a contractual attribute, and agencies want evidence you can measure and report on it.

### December: The Preemption Strategy

On December 11, the administration issued an [executive order](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/) aimed at challenging state AI laws. From Section 4:

> The Secretary shall publish an evaluation that identifies State laws, regulations, or other actions that... require AI models to alter their truthful outputs based on protected characteristics or other group-based classifications.

Colorado's [SB24-205](https://leg.colorado.gov/bills/sb24-205) is named specifically. The order directs:

- **DOJ AI Litigation Task Force** to challenge state laws (~January 10, 2026)
- **Commerce evaluation** identifying conflicting state laws (~March 11, 2026)
- **FCC proceeding** on federal disclosure standards that could preempt state requirements (~June 2026)
- **FTC policy statement** on when state laws are preempted (~June 2026)
- Authority to **condition federal grants** on states not enforcing identified laws

This isn't instant preemption. It's an attempt to build legal and administrative pressure toward a single national standard. Whether it succeeds depends on litigation and congressional action, neither of which has happened yet.

---

## Enforcement Without New Laws

Regulators don't need bespoke AI statutes to take action. The FTC's [case against Air AI](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-takes-action-against-air-ai-deceptive-practices) is an example: deceptive performance claims, earnings claims, and refund promises already have enforcement playbooks under Section 5.

The practical implication: marketing language about "autonomous agents," "guaranteed savings," or "replaces staff" needs the same rigor as security claims. If you can't substantiate it, don't say it.

---

## State Laws

While federal policy shifted, states continued legislating:

| State | Law | Requirements | Compliance Date |
|-------|-----|--------------|-----------------|
| Colorado | [SB24-205](https://leg.colorado.gov/bills/sb24-205) | Impact assessments, algorithmic discrimination prevention, consumer notices | June 30, 2026 |
| California | [SB 53](https://legiscan.com/CA/text/SB53/id/3271094) | Safety frameworks, catastrophic risk assessments for frontier models | Signed Sept 2025 |
| California | AB 2013 | Training data transparency | January 1, 2026 |
| California | SB 942 | AI detection tools, content provenance | August 2, 2026 |
| NYC | [Local Law 144](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools) | Bias audits, candidate notice for hiring AI | In effect |
| Texas | HB 149 | Prohibited practices, government AI disclosure | January 1, 2026 |

Most state laws focus on deployment harms rather than model training: discrimination, consumer deception, safety for vulnerable users, transparency in consequential decisions. This means requirements like impact assessments, audit trails, human review pathways, and incident response procedures.

The federal preemption order and state laws reflect a disagreement about what AI systems should optimize for. The federal position treats accuracy and non-discrimination as potentially conflicting. The state position treats non-discrimination requirements as consumer protection. Colorado's law doesn't require inaccurate outputs; it requires deployers to use "reasonable care" to avoid algorithmic discrimination.

On December 9, a [coalition of state Attorneys General](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/) sent letters to major AI companies requesting pre-release safety testing, independent audits, and incident logging. The litigation that resolves the federal-state tension hasn't started yet.

---

## International

### EU

The EU AI Act passed in 2024 and began implementation in 2025:

- **February 2025:** Prohibited practices (social scoring, certain biometric systems) took effect
- **August 2025:** General-purpose AI model obligations took effect
- **August 2026:** Most high-risk AI system requirements apply

If you sell into the EU, you'll need to determine whether your systems qualify as "high-risk" under the Act's classification scheme. If they do, conformity assessment and documentation requirements apply.

### China

China's AI governance uses administrative filing and content labeling rather than litigation and procurement. Generative AI services that could influence public opinion must register with regulators. As of November 2025, 611 generative AI services and 306 apps had completed this process.

In September, [labeling requirements](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) took effect: AI-generated content must include visible labels, metadata identifying the source and provider, and platforms must verify labels before distribution. Tampering is prohibited. Providers must retain logs for six months.

This approach embeds provenance into the product itself, which differs architecturally from the US approach of documentation that exists alongside the product.

Meanwhile, China's open-source AI ecosystem advanced significantly. DeepSeek's V3 model [matched or exceeded](https://arxiv.org/abs/2412.19437) leading proprietary systems on major benchmarks while being released under an open license. Qwen, Yi, and other Chinese labs released competitive open-weight models. The Chinese AI research community is producing frontier-class work under a regulatory regime that requires registration and labeling—a different set of constraints than disclosure and procurement.

---

## Technical Context

The major model releases of 2025 share a common characteristic: AI systems increasingly use tools, maintain context across extended interactions, and take actions in external environments.

| Model | Capability |
|-------|------------|
| GPT-5 / GPT-5.2 | Multi-step tool use (dozens of chained calls); context compaction |
| Claude 4 | Extended reasoning interleaved with tool use |
| Gemini 3 | Direct access to dev environments (editor, terminal, browser) |
| Llama 4 | 10M token context |
| DeepSeek V3 | Tool use integrated with reasoning; open weights |

Regulations written for single-turn text generation don't fully capture systems that plan, use tools, and modify external state. Evaluating whether a model hallucinates is different from evaluating whether an agent selects the right tool, interprets its output correctly, handles errors appropriately, and takes actions aligned with user intent. Impact assessments and audit requirements apply to deployed systems—prompts, tools, retrieval, context management—not just base models.

### Security

The UK's [National Cyber Security Centre](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection) published guidance noting that prompt injection differs from traditional injection attacks. In SQL injection, there's a clear boundary between code and data. In LLM systems, that boundary doesn't exist in the same way. [OWASP](https://owasp.org/www-project-top-10-for-large-language-model-applications/) lists prompt injection as the top risk in its LLM security guidance.

If your system reads untrusted input—user documents, web pages, API responses—its outputs can be manipulated. Testing for compliance with "truthful output" requirements needs to cover adversarial conditions, not just cooperative ones.

---

## 2026 Timeline

| Date | Event |
|------|-------|
| ~Jan 10 | DOJ AI Litigation Task Force established |
| Jan 1 | California AB 2013 (training data transparency) effective |
| Jan 1 | Texas HB 149 effective |
| ~Mar 11 | Commerce evaluation of state laws due |
| Mar 11 | Agencies update LLM procurement policies (M-26-04) |
| ~Jun 11 | FCC proceeding on federal disclosure standard begins |
| ~Jun 11 | FTC policy statement on preemption due |
| Jun 30 | Colorado SB24-205 compliance |
| Aug 2 | California SB 942 effective |
| Aug 2026 | EU AI Act high-risk requirements apply |
| 2026 | TAKE IT DOWN Act: platforms must remove nonconsensual intimate images within 48 hours of valid request |

---

## What This Means for Builders

**Documentation is now structural.** Whether you're responding to a federal RFP, complying with a state law, or filling out an enterprise security questionnaire, you'll be asked for documentation about how your system works and how you tested it. Model cards, evaluation results, acceptable use policies, incident response processes. If this exists but is scattered across internal wikis and Slack threads, you'll need to consolidate it.

**Testing needs to cover deployed systems.** Regulatory requirements focus on use cases and deployments—the combination of model, prompts, tools, retrieval, and guardrails that users interact with. If your application uses retrieval, test retrieval quality. If it uses tools, test tool selection and error handling. If it maintains context across turns, test behavior at different context lengths.

**The regulatory landscape is unsettled.** The federal-state conflict isn't resolved. Preemption litigation hasn't started. International requirements continue to diverge. Building compliance infrastructure that adapts to different requirements is more practical than optimizing for any single regime.

---

Promptfoo is an open-source eval and red-teaming framework. We built it because policy keeps converging on the same demand: show your work. If you're navigating these requirements, [we're around](https://www.promptfoo.dev/contact/).

If you only do one thing before 2026: make your AI system's behavior measurable, repeatable, and explainable to someone outside your team.

---

## Further Reading

**Federal policy:**
- [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf) – December 2025 LLM procurement guidance
- [December 2025 preemption EO](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/)
- [EO 14319](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/) – July 2025 LLM requirements

**State laws:**
- [Colorado SB24-205](https://leg.colorado.gov/bills/sb24-205)
- [California SB 53](https://legiscan.com/CA/text/SB53/id/3271094)
- [NYC LL144 enforcement](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools)

**Technical:**
- [NCSC on prompt injection](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection)
- [OWASP Top 10 for LLMs](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

**News:**
- [Reuters: Trump AI order faces hurdles](https://www.reuters.com/legal/government/trumps-ai-order-faces-political-legal-hurdles-2025-12-12/)
- [Reuters: State AGs warn AI companies](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/)
- [FTC v. Air AI](https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-takes-action-against-air-ai-deceptive-practices)
