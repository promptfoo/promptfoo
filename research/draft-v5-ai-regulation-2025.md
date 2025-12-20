# How AI Regulation Changed in 2025

If you sell AI to the federal government, you have until March 2026 to provide documentation you probably don't have yet.

That deadline comes from [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf), issued in December. It requires agencies purchasing large language models to request "ichallenge cards, system cards, or data cards," evaluation artifacts, acceptable use policies, and user feedback mechanisms. If you're selling an LLM-based product to a federal agency and you don't have these artifacts, you have about 90 days to create them.

This is one deadline among many. 2025 was the year AI regulation stopped being theoretical and became operational. Executive orders became procurement requirements. Procurement requirements became contract clauses. State legislatures passed laws that the federal government now seeks to invalidate.

Here's what happened and what's coming next.

---

## The Federal Policy Swap

The Biden administration's AI framework lasted fourteen months.

[Executive Order 14110](https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2023/10/30/executive-order-on-the-safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence/), issued in October 2023, created categories for "rights-impacting" and "safety-impacting" AI, required federal agencies to implement risk-management practices, and used the Defense Production Act to compel reporting from developers of large models—including information about model weights and training runs.

On January 20, 2025, day one of the new administration, EO 14110 was rescinded. [Executive Order 14179](https://www.federalregister.gov/documents/2025/01/31/2025-02172/removing-barriers-to-american-leadership-in-artificial-intelligence) replaced it three days later, reframing federal AI policy around "removing barriers" and "American leadership."

The framing changed. The mechanism didn't.

Federal AI governance still flows through the same channel: executive order sets direction, OMB memo operationalizes it, procurement office embeds requirements in contracts. What changed:

- "Rights-impacting AI" became "high-impact AI"
- Compliance timelines extended from immediate to 365 days
- The requirement that frontier model developers report to the government was removed
- The overall posture shifted from risk management to innovation promotion

What stayed the same:

- Pre-deployment testing requirements for high-risk AI
- Impact assessments and human oversight expectations
- Agency AI inventories
- The expectation that vendors provide documentation

The continuity matters. Regardless of which party holds the White House, if you want to sell AI to the government, you need evidence that your system works as claimed.

## LLM-Specific Requirements

In July, [Executive Order 14319](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/) added requirements for large language models. It established two "Unbiased AI Principles":

> **Truth-seeking:** LLMs should provide accurate responses to factual queries and acknowledge uncertainty when appropriate.
>
> **Ideological neutrality:** LLMs should not encode partisan viewpoints into outputs unless specifically prompted.

The December OMB memo implementing these principles specifies what agencies must now request:

| Artifact | Description |
|----------|-------------|
| Model/system/data cards | Documentation of training, capabilities, limitations |
| Evaluation artifacts | Results from testing |
| Acceptable use policy | What the system should and shouldn't do |
| Feedback mechanism | How users report problematic outputs |

Agencies must update their procurement policies by **March 11, 2026**.

## The Preemption Push

On December 11, the administration escalated.

A [new executive order](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/) directs the Department of Justice to establish an "AI Litigation Task Force" to challenge state AI laws. The order is explicit about targets. From Section 4:

> The Secretary shall publish an evaluation that identifies State laws, regulations, or other actions that... require AI models to alter their truthful outputs based on protected characteristics or other group-based classifications.

Colorado's [SB24-205](https://leg.colorado.gov/bills/sb24-205) is named specifically as an example of "state overreach." The order argues that requiring AI systems to avoid algorithmic discrimination could "force AI models to produce false results."

This is preemption as strategy. The federal government is asserting that it—not states—should define what AI systems must do. Key provisions:

- **DOJ task force** must be established by January 10, 2026
- **Commerce evaluation** of state laws due by March 11, 2026
- **FCC proceeding** on federal disclosure standards must begin by June
- **FTC statement** on when state laws are preempted due by June
- Federal agencies may **condition grants** on states not enforcing identified laws

Whether this succeeds depends on litigation that hasn't happened yet.

---

## The State Landscape

While federal policy changed direction, states kept legislating.

| State | Law | What It Requires | Compliance Date |
|-------|-----|------------------|-----------------|
| Colorado | [SB24-205](https://leg.colorado.gov/bills/sb24-205) | Impact assessments, algorithmic discrimination prevention, consumer notices | June 30, 2026 |
| California | [SB 53](https://legiscan.com/CA/text/SB53/id/3271094) | Safety frameworks, catastrophic risk assessments for frontier models | Signed Sept 2025 |
| California | AB 2013 | Training data transparency | January 1, 2026 |
| California | SB 942 | AI detection tools, content provenance | August 2, 2026 |
| NYC | [Local Law 144](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools) | Bias audits, candidate notice for hiring AI | In effect since July 2023 |
| Texas | HB 149 | Prohibited practices, government AI disclosure | January 1, 2026 |

The federal-state conflict reflects a real disagreement about values.

The federal position: accuracy and non-discrimination can conflict, and accuracy should win. Requiring AI systems to avoid disparate impact could force them to produce "untruthful" outputs.

The state position: a system that produces discriminatory outcomes is already causing harm. Non-discrimination is consumer protection, not censorship.

This isn't a technical question. It's a policy question about what AI systems should optimize for.

On December 9, a [coalition of state Attorneys General](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/) sent letters to major AI companies requesting pre-release safety testing, independent audits, incident logging, and user notification. Two weeks earlier, another group sent a letter to Congress opposing federal preemption.

The battle lines are drawn. The litigation hasn't started.

---

## The International Picture

### China: Filing, Labeling, and Open Source

China's AI governance operates differently. Instead of litigation and procurement, it uses administrative filing and content labeling.

Generative AI services that could influence public opinion must register with regulators and undergo security assessments. As of November 2025, 611 generative AI services and 306 apps had completed this process. In September, [labeling requirements](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) took effect:

- AI-generated content requires visible labels
- Metadata must identify the source and provider
- Platforms must verify labels before distribution
- Tampering with labels is prohibited
- Six-month log retention required

This is architecturally different. China embeds provenance into the product itself. The U.S. focuses on documentation that exists alongside the product.

Meanwhile, China's open-source AI ecosystem advanced rapidly. DeepSeek's V3 model [matched or exceeded](https://arxiv.org/abs/2412.19437) leading proprietary systems on major benchmarks while being freely available. Qwen, Yi, and other Chinese labs released competitive open-weight models under permissive licenses.

Two different governance philosophies. Both producing frontier-class AI systems. The question of which approach better serves users and developers remains open.

### EU: Implementation Begins

The EU AI Act passed in 2024. Key milestones:

- **February 2025:** Prohibitions on "unacceptable risk" AI took effect
- **August 2025:** General-purpose AI model requirements took effect
- **August 2026:** High-risk AI system requirements begin

If you sell into the EU, the key question is whether your systems qualify as "high-risk." If they do, conformity assessments apply.

---

## The Technical Context

While regulators wrote rules, the technology moved.

The major model releases of 2025 share a common characteristic: AI systems increasingly use tools, maintain context across extended interactions, and take actions in external environments.

| Model | What Changed |
|-------|--------------|
| GPT-5 / GPT-5.2 | Reliable multi-step tool use (dozens of chained calls); context compaction |
| Claude 4 | Extended reasoning interleaved with tool use |
| Gemini 3 | Direct access to dev environments (editor, terminal, browser) |
| Llama 4 | 10M token context |
| DeepSeek V3 | Tool use integrated with reasoning; open weights |

Regulations written for single-turn text generation don't capture systems that plan, use tools, and modify external state. When a model can browse the web, execute code, or call APIs, "output" means something different.

This matters for testing. Evaluating whether a model hallucinates is different from evaluating whether an agent selects the right tool, interprets its output correctly, and takes appropriate action.

### Security Is Now a Compliance Property

As systems gain capabilities, they gain attack surface.

The UK's [National Cyber Security Centre](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection) published guidance noting that prompt injection differs from traditional injection attacks. In SQL injection, there's a clear boundary between code and data. In LLM systems, that boundary doesn't exist.

[OWASP](https://owasp.org/www-project-top-10-for-large-language-model-applications/) lists prompt injection as the top risk in its LLM security guidance.

If your system reads untrusted input—user documents, web pages, API responses—its outputs can be manipulated. "Truthful outputs" isn't just an alignment property. It's a security property.

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

**Documentation is now structural.** Whether you're responding to a federal RFP, complying with a state law, or filling out an enterprise security questionnaire, you'll be asked for documentation about how your system works and how you tested it. Model cards, eval results, acceptable use policies, incident response processes. If this documentation is scattered across wikis and Slack, you have work to do.

**Testing needs to cover the deployed system.** Regulatory requirements focus on use cases and deployments—the combination of model, prompts, tools, retrieval, and guardrails that users interact with. Benchmarking a base model doesn't satisfy these requirements. If your application uses retrieval, test retrieval. If it uses tools, test tool selection. If it maintains context, test behavior at different context lengths.

**Uncertainty is the operating condition.** The federal-state conflict isn't resolved. Preemption litigation hasn't started. The FCC proceeding hasn't concluded. International requirements diverge. Building compliance infrastructure that adapts to different requirements is more practical than optimizing for any single regime.

We've spent a lot of time reading these memos and implementing testing infrastructure that produces the artifacts they require. The same infrastructure that helps teams iterate confidently is the infrastructure that produces evidence for auditors and procurement officers. If you're navigating these requirements and want to talk about what to test or how to document it, [we're around](https://www.promptfoo.dev/contact/).

---

## Further Reading

**Federal policy:**
- [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf) - December 2025 LLM procurement guidance
- [December 2025 preemption EO](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/)
- [EO 14319](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/) - July 2025 "Unbiased AI" order

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
