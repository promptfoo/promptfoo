---
title: 'How AI Regulation Changed in 2025'
description: 'Why AI compliance questions multiplied in 2025. A field guide to federal procurement, state laws, EU AI Act deadlines, and what practitioners need to prepare.'
image: /img/blog/ai-regulation-2025/hero.jpg
keywords:
  [
    AI regulation,
    AI compliance,
    AI policy,
    OMB M-26-04,
    EU AI Act,
    Colorado SB24-205,
    AI procurement,
    LLM documentation,
    model cards,
    AI testing,
    federal AI policy,
    state AI laws,
  ]
date: 2025-12-15
authors: [michael]
tags: [ai-policy, compliance, evaluation]
---

If you build AI applications, the compliance questions multiplied in 2025. Enterprise security questionnaires added AI sections. Customers started asking for model cards and evaluation reports. RFPs began requiring documentation that didn't exist six months ago.

You don't need to train models to feel this. Federal procurement buys LLM capabilities through resellers, integrators, and platforms, and enterprise buyers are starting to ask the same questions.

Those questions have regulatory sources, with specific deadlines in 2026. [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf), issued in December, requires federal agencies purchasing LLMs to request model cards, evaluation artifacts, and acceptable use policies by March. California's training data transparency law [AB 2013](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2013) takes effect January 1. Colorado's algorithmic discrimination requirements in [SB 24-205](https://leg.colorado.gov/bills/sb24-205) (delayed by [SB25B-004](https://leg.colorado.gov/bills/sb25b-004)) arrive June 30. The EU's high-risk AI system rules begin phasing in August.

This post covers what changed in 2025 and what's coming in 2026, written for practitioners who need to understand why these questions are appearing and what to do about them.

<!-- truncate -->

## How Regulation Reaches Your Product

In practice, AI regulation flows through a stack:

<div style={{display: 'flex', gap: '2.5rem', alignItems: 'flex-start', flexWrap: 'wrap', margin: '1.5rem 0 2rem'}}>
  <div style={{flex: '1 1 300px', minWidth: '260px', maxWidth: '400px'}}>
    <img src="/img/blog/ai-regulation-2025/compliance-stack.svg" alt="The compliance stack: Executive policy flows down through agency guidance, procurement requirements, and contract clauses, ultimately requiring evidence from vendors" style={{width: '100%'}} />
  </div>
  <div style={{flex: '1 1 340px'}}>
    <p style={{marginTop: 0}}>This is why 2025 mattered: the stack filled in. Executive orders issued years ago became OMB memos, which became procurement language, which became contract requirements, which became requests for evidence that vendors need to produce.</p>
    <p>If you've received a security questionnaire asking about your AI systems, or seen new sections in an RFP about model documentation, you've felt this stack.</p>
  </div>
</div>

---

## US Federal Policy

### The January Transition

The Biden administration issued [Executive Order 14110](https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2023/10/30/executive-order-on-the-safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence/) in October 2023, creating categories for "rights-impacting" and "safety-impacting" AI, requiring federal agencies to implement risk-management practices, and using the Defense Production Act to compel reporting from developers of large models. That order was rescinded on January 20, 2025. [Executive Order 14179](https://www.federalregister.gov/documents/2025/01/31/2025-02172/removing-barriers-to-american-leadership-in-artificial-intelligence) replaced it the same day.

The implementation mechanism stayed the same: executive order sets direction, OMB memo operationalizes it, procurement office embeds requirements in contracts. What changed:

<div style={{
  margin: '1.5rem 0',
  padding: '1.25rem 1.5rem',
  borderLeft: '4px solid #8b5cf6',
  borderRadius: '0 8px 8px 0',
  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%)',
  fontSize: '0.9rem'
}}>
  <div style={{
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '1rem'
  }}>
    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
      <span style={{fontSize: '0.75rem', fontWeight: '600', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Terminology</span>
      <span><span style={{color: '#6b7280', textDecoration: 'line-through', textDecorationColor: '#d1d5db'}}>"Rights-impacting AI"</span> <span style={{color: '#8b5cf6', margin: '0 0.35rem'}}>→</span> <span style={{color: '#1f2937', fontWeight: '500'}}>"High-impact AI"</span></span>
    </div>
    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
      <span style={{fontSize: '0.75rem', fontWeight: '600', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Compliance timeline</span>
      <span><span style={{color: '#6b7280', textDecoration: 'line-through', textDecorationColor: '#d1d5db'}}>Immediate</span> <span style={{color: '#8b5cf6', margin: '0 0.35rem'}}>→</span> <span style={{color: '#1f2937', fontWeight: '500'}}>365 days</span></span>
    </div>
    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
      <span style={{fontSize: '0.75rem', fontWeight: '600', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Frontier model reporting</span>
      <span><span style={{color: '#6b7280', textDecoration: 'line-through', textDecorationColor: '#d1d5db'}}>Required under DPA</span> <span style={{color: '#8b5cf6', margin: '0 0.35rem'}}>→</span> <span style={{color: '#1f2937', fontWeight: '500'}}>Removed</span></span>
    </div>
    <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
      <span style={{fontSize: '0.75rem', fontWeight: '600', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Overall posture</span>
      <span><span style={{color: '#6b7280', textDecoration: 'line-through', textDecorationColor: '#d1d5db'}}>Risk management</span> <span style={{color: '#8b5cf6', margin: '0 0.35rem'}}>→</span> <span style={{color: '#1f2937', fontWeight: '500'}}>Innovation promotion</span></span>
    </div>
  </div>
</div>

What didn't change: pre-deployment testing requirements for high-risk AI, impact assessments, human oversight expectations, agency AI inventories, and the expectation that vendors provide documentation.

### July: LLM Procurement Requirements

[Executive Order 14319](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/) added requirements specific to large language models, establishing two "Unbiased AI Principles":

> **Truth-seeking:** LLMs should provide accurate responses to factual queries and acknowledge uncertainty when appropriate.
>
> **Ideological neutrality:** LLMs should not encode partisan viewpoints into outputs unless specifically prompted.

The December OMB memo implementing these principles specifies what agencies must request:

| Artifact                | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| Model/system/data cards | Documentation of training, capabilities, limitations |
| Evaluation artifacts    | Results from testing                                 |
| Acceptable use policy   | What the system should and shouldn't do              |
| Feedback mechanism      | How users report problematic outputs                 |

Agencies must update their procurement policies by **March 11, 2026**. The engineering implication: model behavior is now a contractual attribute, and agencies want evidence you can measure and report on it.

For application builders, this means preparing:

- **System card**: which model(s) you use, your prompts/policies, tools, retrieval sources, and human review points
- **Evaluation artifacts**: red-team results for tool misuse, prompt injection, and data leakage
- **Acceptable use policy**: what your UI allows, what it blocks, and what your system won't do
- **Feedback mechanism**: a "report output" button plus an internal triage workflow

### December: The Preemption Strategy

On December 11, the administration issued an [executive order](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/) aimed at challenging state AI laws. From Section 4:

> The Secretary shall publish an evaluation that identifies State laws, regulations, or other actions that... require AI models to alter their truthful outputs based on protected characteristics or other group-based classifications.

Colorado's [SB24-205](https://leg.colorado.gov/bills/sb24-205) is named specifically. The order directs:

- **DOJ AI Litigation Task Force** to challenge state laws (~January 10, 2026)
- **Commerce evaluation** identifying conflicting state laws (~March 11, 2026)
- **FTC policy statement** on when state laws are preempted (~March 2026)
- **FCC proceeding** on federal disclosure standards that could preempt state requirements (~June 2026)
- Authority to **condition federal grants** on states not enforcing identified laws

This isn't instant preemption. It's an attempt to build legal and administrative pressure toward a single national standard. Whether it succeeds depends on litigation and congressional action, neither of which has happened yet.

---

## Enforcement Without New Laws

Regulators don't need bespoke AI statutes to take action. The FTC's [case against Air AI](https://www.ftc.gov/news-events/news/press-releases/2025/08/ftc-takes-action-against-air-ai-deceptive-practices) in August is an example: deceptive performance claims, earnings claims, and refund promises already have enforcement playbooks under Section 5.

The practical implication: marketing language about "autonomous agents," "guaranteed savings," or "replaces staff" needs the same rigor as security claims. If you can't substantiate it, don't say it.

---

## State Laws

While federal policy shifted, states continued legislating:

| State      | Law                                                                                                                                                                                                              | Requirements                                                                                                   | Compliance Date                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Colorado   | [SB24-205](https://leg.colorado.gov/bills/sb24-205) (delayed by [SB25B-004](https://leg.colorado.gov/bills/sb25b-004))                                                                                           | **Deployer obligations:** impact assessments, algorithmic discrimination prevention, consumer notices, appeals | June 30, 2026 (originally Feb 1) |
| California | [SB 53](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB53)                                                                                                                     | Safety frameworks, catastrophic risk assessments (frontier model developers)                                   | Signed Sept 2025                 |
| California | [AB 2013](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2013)                                                                                                                 | Training data transparency (includes fine-tuning)                                                              | January 1, 2026                  |
| California | [SB 942](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240SB942) (date extended by [AB 853](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260AB853)) | AI detection tools, content provenance                                                                         | August 2, 2026                   |
| NYC        | [Local Law 144](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools)                                                                           | Bias audits, candidate notice for hiring AI                                                                    | In effect                        |
| Texas      | [HB 149](https://capitol.texas.gov/tlodocs/89R/billtext/pdf/HB00149F.pdf)                                                                                                                                        | Prohibited practices, government AI disclosure                                                                 | January 1, 2026                  |

Most state laws focus on deployment harms rather than model training: discrimination, consumer deception, safety for vulnerable users, transparency in consequential decisions. This means requirements like impact assessments, audit trails, human review pathways, and incident response procedures.

The federal preemption order and state laws reflect a disagreement about what AI systems should optimize for. The federal position treats accuracy and non-discrimination as potentially conflicting. The state position treats non-discrimination requirements as consumer protection. Colorado's law doesn't require inaccurate outputs; it requires deployers to use "reasonable care" to avoid algorithmic discrimination.

On December 10, [42 state Attorneys General](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/) sent letters to major AI companies requesting pre-release safety testing, independent audits, and incident logging. The litigation that resolves the federal-state tension hasn't started yet.

---

## International

### EU

The EU AI Act ([Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)) passed in 2024 and began implementation in 2025 ([official timeline](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)):

- **February 2025:** Prohibited practices (social scoring, certain biometric systems) took effect
- **August 2025:** General-purpose AI model obligations took effect
- **August 2026:** High-risk AI system requirements were scheduled to apply

However, under pressure from industry and member states citing competitiveness concerns, the Commission proposed a [Digital Omnibus package](https://commission.europa.eu/news-and-media/news/simpler-digital-rules-help-eu-businesses-grow-2025-11-19_en) in November 2025 that would delay high-risk obligations by 16 months, to December 2027. The proposal still requires Parliament and Council approval, but it signals that the original timeline is softening.

If you sell into the EU, you'll need to determine whether your systems qualify as "high-risk" under the Act's classification scheme. If they do, conformity assessment and documentation requirements apply, though the exact timing is now less certain.

### China

China's AI governance uses administrative filing and content labeling rather than litigation and procurement. Under the [Interim Measures for Generative AI Services](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm), public-facing services with "public opinion attributes or social mobilization capacity" must complete security assessments and algorithm filing before launch. As of November 2025, [611 generative AI services and 306 apps](https://www.cac.gov.cn/2025-11/11/c_1764585284364412.htm) had completed this process, and apps must now publicly disclose which filed model they use, including the filing number.

In September, [labeling requirements](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) ([English translation](https://digichina.stanford.edu/work/china-issues-regulations-to-label-ai-generated-content/)) took effect, backed by a mandatory national standard (GB 45438-2025): AI-generated content must include visible labels, metadata identifying the source and provider, and platforms must verify labels before distribution. Tampering is prohibited. The rules include a six-month log retention requirement in specific cases (for example, when explicit labeling is suppressed at a user's request). In late November, CAC [took action](https://www.cac.gov.cn/2025-11/25/c_1765795550841819.htm) against apps failing to implement these requirements; enforcement looks like compliance campaigns and removals rather than litigation.

In October, CAC also published [guidance for government deployments](https://www.cac.gov.cn/2025-10/10/c_1761819469929310.htm), pushing agencies toward filed models with stronger risk disclosures and hallucination risk management.

<div style={{textAlign: 'center', margin: '2rem 0'}}>
  <img src="/img/blog/ai-regulation-2025/us-china-comparison.svg" alt="US vs China governance approaches: The US requires documentation alongside the product, while China requires provenance embedded within the product" style={{maxWidth: '700px', width: '100%'}} />
</div>

Meanwhile, China's open-source AI reached the frontier. DeepSeek's V3 model matched or exceeded leading proprietary systems on major benchmarks ([technical report](https://arxiv.org/abs/2412.19437)) and is available as open weights with published licensing terms ([GitHub](https://github.com/deepseek-ai/DeepSeek-V3), [model license](https://github.com/deepseek-ai/DeepSeek-V3/blob/main/LICENSE-MODEL)). Qwen, Yi, and other Chinese labs released competitive open-weight models. The Chinese AI research community is producing frontier-class work under a regulatory regime that requires registration and provenance, a different set of constraints than disclosure and procurement.

### Elsewhere

Other jurisdictions moved in 2025, generally converging on familiar control families: South Korea's [AI Basic Act](https://www.trade.gov/market-intelligence/south-korea-artificial-intelligence-ai-basic-act) takes effect January 2026 with risk assessment and local representative requirements. Japan passed an [AI Promotion Act](https://www.ibanet.org/japan-emerging-framework-ai-legislation-guidelines) in May. Australia published [10 guardrails](https://www.industry.gov.au/publications/voluntary-ai-safety-standard/10-guardrails) that read like a procurement checklist. India proposed [specific labeling thresholds](https://www.reuters.com/business/media-telecom/india-proposes-strict-it-rules-labelling-deepfakes-amid-ai-misuse-2025-10-22/) for AI-generated content (10% of a visual, first 10% of audio). The UK [rebranded its AI Safety Institute](https://www.gov.uk/government/news/tackling-ai-security-risks-to-unleash-growth-and-deliver-plan-for-change) as the AI Security Institute. Separately, the UK continues fighting over copyright and training data. The pattern: documentation, evaluation, oversight, and provenance are becoming baseline expectations everywhere.

---

## Technical Context

The center of gravity shifted in 2025: from single-prompt completion to **agentic systems** that plan over many steps, call tools, maintain state across long interactions, and take actions in external environments. This happened across US labs and Chinese labs simultaneously.

Three patterns stand out:

- **Hybrid "fast vs think" modes became standard.** Frontier vendors now ship paired variants trading latency for deeper reasoning: GPT-5.2's Instant/Thinking/Pro tiers, Claude 4 and 4.5's extended thinking, Gemini 3's Deep Think mode, and similar options in Chinese open-weight families.
- **Tool use became the product.** [Claude 4](https://www.anthropic.com/news/claude-4) explicitly interleaves reasoning and tool calls. [GPT-5.2](https://openai.com/index/introducing-gpt-5-2/) emphasizes long-horizon reasoning with tool calling. Google's [Gemini 3](https://blog.google/products/gemini/gemini-3/) launched alongside Antigravity, an agent-first environment operating across editor, terminal, and browser.
- **Open weights reached the frontier.** In 2025, "open" stopped meaning "two generations behind." OpenAI released [gpt-oss](https://openai.com/index/gpt-oss-model-card/) under Apache 2.0. Meta shipped [Llama 4](https://www.reuters.com/technology/meta-releases-new-ai-model-llama-4-2025-04-05/). [Mistral 3](https://mistral.ai/news/mistral-3) arrived with Apache 2.0 multimodal models. DeepSeek and Qwen continued releasing competitive open-weight models.

| Lab / Model                     | 2025 Releases                                      | Compliance Implication                                                                                                 |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| OpenAI (GPT-5.2, gpt-oss)       | Tool calling, long-horizon reasoning, open weights | Open weights mean your org becomes the "provider"; tool use expands test surface from output quality to action quality |
| Anthropic (Claude 4, 4.5)       | Extended thinking interleaved with tools           | Agent workflows and "computer use" interactions require testing tool selection, error handling, and action sequences   |
| Google (Gemini 3 + Antigravity) | Agent-first IDE, multi-surface operation           | Systems spanning editor/terminal/browser are exactly what procurement questionnaires struggle to describe              |
| Meta (Llama 4)                  | Open-weight multimodal, long context               | Aggressive context claims (10M marketed) vs practical limits create evaluation complexity                              |
| DeepSeek (R1, V3.x)             | Rapid iteration, explicit agent positioning        | Strong tool use makes system-level evaluation unavoidable                                                              |
| Qwen (Qwen3)                    | Open MoE, thinking modes, 1M context               | More "thinking vs non-thinking" variants multiply the configurations to test                                           |

The compliance implication: regulations written for text-in-text-out systems don't map cleanly to systems that **choose tools, interpret tool output, recover from errors, and mutate external state**. Evaluating whether a model hallucinates is different from evaluating whether an agent selects the right tool, handles its errors appropriately, and takes actions aligned with user intent. Impact assessments and audits need to cover the deployed stack: prompts, tool inventory, tool permissions, retrieval, memory, and logging, not just base models.

---

## 2026 Timeline

![Key AI regulation deadlines in 2026: Q1 brings federal task forces and state laws, Q2 brings FCC/FTC statements and Colorado compliance, Q3 brings EU AI Act enforcement](/img/blog/ai-regulation-2025/timeline-2026.svg)

| Date     | Event                                                                                                                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jan 1    | California AB 2013 (training data transparency) effective                                                                                                                                                                                                 |
| Jan 1    | Texas HB 149 effective                                                                                                                                                                                                                                    |
| ~Jan 10  | DOJ AI Litigation Task Force established                                                                                                                                                                                                                  |
| ~Mar 11  | Commerce evaluation of state laws due                                                                                                                                                                                                                     |
| ~Mar 11  | FTC policy statement on preemption due                                                                                                                                                                                                                    |
| Mar 11   | Agencies update LLM procurement policies (M-26-04)                                                                                                                                                                                                        |
| May 19   | [TAKE IT DOWN Act (S. 146)](https://www.congress.gov/bill/119th-congress/senate-bill/146): platforms must remove nonconsensual intimate images within 48 hours of valid request ([CRS summary](https://crsreports.congress.gov/product/pdf/LSB/LSB11272)) |
| ~Jun 11  | FCC proceeding on federal disclosure standard begins                                                                                                                                                                                                      |
| Jun 30   | Colorado SB24-205 compliance                                                                                                                                                                                                                              |
| Aug 2    | California SB 942 effective                                                                                                                                                                                                                               |
| Aug 2026 | EU AI Act high-risk requirements scheduled (may slip to Dec 2027 per Digital Omnibus proposal)                                                                                                                                                            |

---

## What This Means for Builders

**Documentation is now structural.** Whether you're responding to a federal RFP, complying with a state law, or filling out an enterprise security questionnaire, you'll be asked for documentation about how your system works and how you tested it. Model cards, evaluation results, acceptable use policies, incident response processes. If this exists but is scattered across internal wikis and Slack threads, you'll need to consolidate it.

**Testing needs to cover deployed systems.** Regulatory requirements focus on use cases and deployments, the combination of model, prompts, tools, retrieval, and guardrails that users interact with. If your application uses retrieval, test retrieval quality. If it uses tools, test tool selection and error handling. If it maintains context across turns, test behavior at different context lengths. If it reads untrusted input, test adversarial conditions, not just cooperative ones. We built [Promptfoo](/) for exactly this: system-level red teaming and evaluation that produces the artifacts regulators and procurement officers now ask for: exportable results, regression tests, and audit trails that document what you tested and what you found.

**If your AI can take actions, regulators will evaluate the actions.** If your system can issue refunds, send emails, modify records, or execute code, compliance requirements apply to the action path, not just the text output. This is why agentic systems need testing that covers tool selection, error handling, and rollback behavior.

**The regulatory landscape is unsettled.** The federal-state conflict isn't resolved. Preemption litigation hasn't started. International requirements continue to diverge. Building compliance infrastructure that adapts to different requirements is more practical than optimizing for any single regime.

If you only do one thing before 2026: make your AI system's behavior measurable, repeatable, and explainable to someone outside your team.

---

## Further Reading

**Federal policy:**

- [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf) – December 2025 LLM procurement guidance
- [OMB M-25-21](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-21-Accelerating-Federal-Use-of-AI-through-Innovation-Governance-and-Public-Trust.pdf) – Federal AI governance + "high-impact AI" requirements (replaces M-24-10)
- [OMB M-25-22](https://www.whitehouse.gov/wp-content/uploads/2025/02/M-25-22-Driving-Efficient-Acquisition-of-Artificial-Intelligence-in-Government.pdf) – AI acquisition guidance
- [December 2025 preemption EO](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/)
- [EO 14319](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/) – July 2025 LLM requirements

**State laws:**

- [Colorado SB24-205](https://leg.colorado.gov/bills/sb24-205) and [SB25B-004](https://leg.colorado.gov/bills/sb25b-004) (enforcement delay)
- [California SB 53](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB53)
- [California AB 2013](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2013) (training data transparency)
- [California SB 942](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240SB942) and [AB 853](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260AB853) (date extension)
- [Texas HB 149](https://capitol.texas.gov/tlodocs/89R/billtext/pdf/HB00149F.pdf)
- [NYC LL144 enforcement](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools)

**International:**

- [EU AI Act (Regulation 2024/1689)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) – Full text
- [EU AI Act official timeline](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) – Implementation schedule
- [EU Digital Omnibus proposal](https://commission.europa.eu/news-and-media/news/simpler-digital-rules-help-eu-businesses-grow-2025-11-19_en) – November 2025 proposed delays
- [China: Interim Measures for Generative AI](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) – Filing requirements
- [China: Synthetic content labeling measures](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) ([English translation](https://digichina.stanford.edu/work/china-issues-regulations-to-label-ai-generated-content/)) – September 2025
- [China: CAC filing announcements](https://www.cac.gov.cn/2025-11/11/c_1764585284364412.htm) – 611 services / 306 apps as of November 2025

**Technical:**

- [NCSC on prompt injection](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection)
- [OWASP Top 10 for LLMs](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

**News:**

- [Reuters: Trump AI order faces hurdles](https://www.reuters.com/legal/government/trumps-ai-order-faces-political-legal-hurdles-2025-12-12/)
- [Reuters: State AGs warn AI companies](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/)
- [FTC v. Air AI](https://www.ftc.gov/news-events/news/press-releases/2025/08/ftc-takes-action-against-air-ai-deceptive-practices)
