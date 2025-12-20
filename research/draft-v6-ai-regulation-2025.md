# How AI Regulation Changed in 2025

If you sell AI to the federal government, you have until March 2026 to provide documentation you probably don't have yet. [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf), issued in December, requires agencies purchasing large language models to request model cards or system cards, evaluation artifacts, acceptable use policies, and user feedback mechanisms. If you're selling an LLM-based product to a federal agency and don't have these artifacts, you have about 90 days to create them.

That's one deadline. There are others. California's training data transparency law takes effect January 1. Colorado's algorithmic discrimination requirements arrive June 30. The EU's high-risk AI system rules begin phasing in next August.

This post covers what changed in 2025 and what's scheduled for 2026, written for people building AI systems who need to understand the compliance landscape.

---

## The Federal Policy Transition

The Biden administration issued [Executive Order 14110](https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2023/10/30/executive-order-on-the-safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence/) in October 2023, creating categories for "rights-impacting" and "safety-impacting" AI, requiring federal agencies to implement risk-management practices, and using the Defense Production Act to compel reporting from developers of large models. That order was rescinded on January 20, 2025. [Executive Order 14179](https://www.federalregister.gov/documents/2025/01/31/2025-02172/removing-barriers-to-american-leadership-in-artificial-intelligence) replaced it three days later, reframing federal AI policy around "removing barriers" and "American leadership."

The implementation mechanism remained the same: executive order sets direction, OMB memo operationalizes it, procurement office embeds requirements in contracts. What changed was the framing and some specific requirements:

| Changed | From | To |
|---------|------|-----|
| Terminology | "Rights-impacting AI" | "High-impact AI" |
| Compliance timeline | Immediate | 365 days |
| Frontier model reporting | Required under DPA | Removed |
| Overall posture | Risk management | Innovation promotion |

What didn't change: pre-deployment testing requirements for high-risk AI, impact assessments, human oversight expectations, agency AI inventories, and the expectation that vendors provide documentation. If you want to sell AI to the government, you still need evidence that your system works as claimed. The December OMB memo makes those documentation requirements explicit.

## LLM-Specific Requirements

In July, [Executive Order 14319](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/) added requirements specific to large language models, establishing two "Unbiased AI Principles":

> **Truth-seeking:** LLMs should provide accurate responses to factual queries and acknowledge uncertainty when appropriate.
>
> **Ideological neutrality:** LLMs should not encode partisan viewpoints into outputs unless specifically prompted.

The December OMB memo implementing these principles specifies what agencies must request when purchasing LLMs:

| Artifact | Description |
|----------|-------------|
| Model/system/data cards | Documentation of training, capabilities, limitations |
| Evaluation artifacts | Results from testing |
| Acceptable use policy | What the system should and shouldn't do |
| Feedback mechanism | How users report problematic outputs |

Agencies must update their procurement policies by March 11, 2026. The memo doesn't define what counts as adequate documentation, so there's room for interpretation, but the direction is clear: if you're selling LLMs to the federal government, you need to show your work.

## The Federal Preemption Strategy

On December 11, the administration issued an [executive order](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/) establishing a strategy to challenge state AI laws. The order directs the Department of Justice to create an "AI Litigation Task Force" to challenge state laws that conflict with federal policy. From Section 4:

> The Secretary shall publish an evaluation that identifies State laws, regulations, or other actions that... require AI models to alter their truthful outputs based on protected characteristics or other group-based classifications.

Colorado's [SB24-205](https://leg.colorado.gov/bills/sb24-205) is named specifically as an example of state overreach. The order argues that requiring AI systems to avoid algorithmic discrimination could "force AI models to produce false results."

Key provisions and their deadlines:

| Provision | Deadline |
|-----------|----------|
| DOJ AI Litigation Task Force established | ~January 10, 2026 |
| Commerce evaluation of state laws | ~March 11, 2026 |
| FCC proceeding on federal disclosure standard | ~June 11, 2026 |
| FTC policy statement on preemption | ~June 11, 2026 |

The order also authorizes federal agencies to condition discretionary grants on states agreeing not to enforce identified AI laws. Whether any of this succeeds depends on litigation outcomes and congressional action, neither of which has happened yet. In the near term, it creates uncertainty: state laws remain on the books, but their enforceability is now contested.

---

## The State Landscape

While federal policy shifted, states continued passing AI laws. Here's what's on the books:

| State | Law | Requirements | Compliance Date |
|-------|-----|--------------|-----------------|
| Colorado | [SB24-205](https://leg.colorado.gov/bills/sb24-205) | Impact assessments, algorithmic discrimination prevention, consumer notices for high-risk AI | June 30, 2026 |
| California | [SB 53](https://legiscan.com/CA/text/SB53/id/3271094) | Safety frameworks, catastrophic risk assessments for frontier models | Signed Sept 2025 |
| California | AB 2013 | Training data transparency | January 1, 2026 |
| California | SB 942 | AI detection tools, content provenance | August 2, 2026 |
| NYC | [Local Law 144](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools) | Bias audits, candidate notice for hiring AI | In effect since July 2023 |
| Texas | HB 149 | Prohibited practices, government AI disclosure | January 1, 2026 |

The federal preemption order and state laws reflect a disagreement about what AI systems should optimize for. The federal position treats accuracy and non-discrimination as potentially conflicting—and argues that accuracy should prevail when they do. The state position treats non-discrimination requirements as consumer protection, not as constraints on accuracy. Colorado's law, for example, doesn't require AI systems to produce inaccurate outputs; it requires deployers to use "reasonable care" to avoid algorithmic discrimination and to conduct impact assessments.

On December 9, a [coalition of state Attorneys General](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/) sent letters to major AI companies requesting pre-release safety testing, independent audits, incident logging, and user notification. Two weeks earlier, another group sent a letter to Congress opposing federal preemption of state consumer protection laws.

For builders, the practical implication is that you may face different requirements depending on where you operate and who you sell to. Federal contracts will emphasize one set of values; some state laws will emphasize another. The litigation that resolves this tension hasn't started yet.

---

## The International Picture

### China

China's AI governance uses administrative filing and content labeling rather than litigation and procurement. Generative AI services that could influence public opinion must register with regulators and undergo security assessments. As of November 2025, 611 generative AI services and 306 apps had completed this process.

In September, [labeling requirements](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) took effect. AI-generated content must include visible labels, metadata identifying the source and provider, and platforms must verify labels before distribution. Tampering with labels is prohibited. Providers must retain logs for six months.

This approach embeds provenance requirements into the product itself, which is architecturally different from the U.S. approach of documentation and assessment that exists alongside the product.

Meanwhile, China's open-source AI ecosystem advanced significantly in 2025. DeepSeek's V3 model [matched or exceeded](https://arxiv.org/abs/2412.19437) leading proprietary systems on major benchmarks while being released under an open license. Qwen, Yi, and other Chinese labs released competitive open-weight models. The Chinese AI research community is producing frontier-class work under a regulatory regime that requires registration and labeling—a different set of constraints than the disclosure and procurement requirements that dominate American policy.

### EU

The EU AI Act passed in 2024 and began implementation in 2025. Prohibitions on "unacceptable risk" AI (social scoring, certain biometric systems) took effect in February. Requirements for general-purpose AI models took effect in August. Requirements for high-risk AI systems begin phasing in during August 2026.

If you sell into the EU, you'll need to determine whether your systems qualify as "high-risk" under the Act's classification scheme. If they do, conformity assessment and documentation requirements apply. The implementing regulations are still being finalized.

---

## The Technical Context

The major model releases of 2025 share a common characteristic: AI systems increasingly use tools, maintain context across extended interactions, and take actions in external environments.

| Model | Capability |
|-------|------------|
| GPT-5 / GPT-5.2 | Multi-step tool use (dozens of chained calls); context compaction |
| Claude 4 | Extended reasoning interleaved with tool use |
| Gemini 3 | Direct access to dev environments (editor, terminal, browser) |
| Llama 4 | 10M token context |
| DeepSeek V3 | Tool use integrated with reasoning; open weights |

Regulations written for single-turn text generation don't fully capture systems that plan, use tools, and modify external state. When a model can browse the web, execute code, or call APIs, "output" means something different than when it only generates text. Evaluating whether a model hallucinates is different from evaluating whether an agent selects the right tool, interprets its output correctly, handles errors appropriately, and takes actions aligned with user intent.

This matters for compliance because impact assessments, incident reporting, and audit requirements apply to deployed systems—including prompts, tools, retrieval, and context management—not just base models.

### Security

The UK's [National Cyber Security Centre](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection) published guidance noting that prompt injection differs from traditional injection attacks. In SQL injection, there's a clear boundary between code and data. In LLM systems, that boundary doesn't exist in the same way. [OWASP](https://owasp.org/www-project-top-10-for-large-language-model-applications/) lists prompt injection as the top risk in its LLM security guidance.

If your system reads untrusted input—user documents, web pages, API responses—its outputs can be manipulated by that input. Testing for "truthful outputs" needs to cover adversarial conditions, not just cooperative ones. This is a security property as much as an alignment property.

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
| Aug 2026 | EU AI Act high-risk requirements begin |

---

## What This Means for Builders

**Documentation requirements are increasing.** Whether you're responding to a federal RFP, complying with a state law, or filling out an enterprise security questionnaire, you'll be asked for documentation about how your system works and how you tested it. Model cards, evaluation results, acceptable use policies, incident response processes. If this documentation exists but is scattered across internal wikis and chat threads, you'll need to consolidate it into formats that external reviewers can use.

**Testing needs to cover deployed systems.** Regulatory requirements focus on use cases and deployments—the combination of model, prompts, tools, retrieval, and guardrails that users interact with. Benchmarking a base model doesn't satisfy these requirements. If your application uses retrieval, test retrieval quality. If it uses tools, test tool selection and error handling. If it maintains context across turns, test behavior at different context lengths.

**The regulatory landscape is unsettled.** The federal-state conflict isn't resolved. Preemption litigation hasn't started. International requirements continue to diverge. Building compliance infrastructure that can adapt to different requirements is more practical than optimizing for any single regime. Documenting what you test, how you test it, and what you found is useful regardless of which specific regulations end up applying.

We've spent time reading these memos and building testing infrastructure that produces the artifacts they require. The infrastructure that helps teams iterate confidently is the same infrastructure that produces evidence for auditors and procurement officers. If you're navigating these requirements and want to talk about what to test or how to document it, [we're around](https://www.promptfoo.dev/contact/).

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
