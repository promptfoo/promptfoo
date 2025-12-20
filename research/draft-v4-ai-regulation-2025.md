# How AI Regulation Changed in 2025

In 2025, AI regulation stopped being theoretical and became operational.

Executive orders became procurement requirements. Procurement requirements became contract clauses. State legislatures passed laws that the federal government now seeks to invalidate. And while American policymakers debated what AI systems should say, Chinese labs released a wave of open-source models that rivaled their Western counterparts.

For teams building AI systems—especially those selling to enterprises or government—this shift changes how you document, test, and ship your work. This post explains what happened and what's coming next.

---

## The Federal Landscape

Two years ago, the Biden administration issued Executive Order 14110, establishing a framework for "safe, secure, and trustworthy" AI development. The order created categories for "rights-impacting" and "safety-impacting" AI, required federal agencies to implement risk-management practices, and used the Defense Production Act to compel reporting from developers of large AI models.

That framework lasted fourteen months.

On January 20, 2025, the first day of the new administration, EO 14110 was rescinded. Three days later, the Trump administration issued Executive Order 14179, reframing federal AI policy around "removing barriers" and promoting "American leadership."

The framing changed. The mechanism didn't.

Federal AI governance still flows through the same channel: executive orders set direction, Office of Management and Budget (OMB) memos operationalize it, and procurement offices embed requirements into contracts. The administration replaced "rights-impacting AI" with "high-impact AI," extended compliance timelines from immediate to 365 days, and removed the requirement that frontier model developers report to the government. But the core expectation—that vendors document how their AI systems behave and provide evidence they've tested them—remained intact.

In July, the administration added requirements specific to large language models. Executive Order 14319 established two "Unbiased AI Principles" for federally purchased systems: LLMs should provide accurate responses to factual queries and acknowledge uncertainty, and they should not encode partisan viewpoints unless specifically prompted.

The December OMB memo implementing these principles, M-26-04, specifies what agencies must now request when purchasing language models: acceptable use policies, model cards or system cards documenting capabilities and limitations, evaluation results, and mechanisms for users to report problematic outputs. Agencies have until March 2026 to update their procurement policies.

### The Preemption Push

On December 11, the administration escalated its posture toward state AI laws.

A new executive order directs the Department of Justice to establish an "AI Litigation Task Force" charged with challenging state laws that conflict with federal policy. The Department of Commerce must publish an assessment identifying state laws that require AI systems to "alter their truthful outputs" or compel disclosures the administration considers unconstitutional. Federal agencies may condition discretionary grants on states agreeing not to enforce identified laws.

The order specifically names Colorado's algorithmic discrimination law as an example of state overreach, arguing it could "force AI models to produce false results."

This is preemption as strategy—using federal power to prevent a patchwork of state requirements from taking hold. Whether it succeeds depends on litigation outcomes and congressional action that hasn't happened yet.

---

## The State Landscape

While federal policy changed direction, states kept legislating.

Colorado's SB24-205 requires developers and deployers of "high-risk" AI systems to use reasonable care to avoid algorithmic discrimination—differential treatment or disparate impact based on protected characteristics. Deployers must conduct impact assessments and notify consumers. The compliance deadline was pushed to June 2026.

California passed multiple AI laws. SB 53 requires developers of large frontier models to publish safety frameworks and conduct risk assessments for catastrophic risks. AB 2013 requires developers of generative AI systems to document their training datasets, effective January 2026. SB 942 requires providers to offer detection tools and content provenance features, effective August 2026.

New York City's Local Law 144, in effect since July 2023, requires employers using automated tools for hiring decisions to obtain independent bias audits and notify candidates. Texas passed HB 149, establishing prohibited AI practices and requiring state agencies to disclose AI use, effective January 2026.

The federal preemption order and these state laws reflect a genuine disagreement about what AI systems should optimize for.

The federal position treats accuracy and non-discrimination as potentially conflicting values—and argues accuracy should prevail. From this view, requiring AI systems to avoid disparate impact could force them to produce "untruthful" outputs.

The state position treats the same requirements as consumer protection. From this view, a system that produces discriminatory outcomes is already causing harm, regardless of whether individual outputs are technically accurate.

This isn't a technical question. It's a policy question about values and priorities. The litigation and rulemaking that will resolve it haven't concluded.

On December 9, a coalition of state Attorneys General sent letters to major AI companies requesting pre-release safety testing, independent third-party audits, incident logging, and user notification when exposed to identified harms. Two weeks earlier, another group of state AGs sent a letter to Congress opposing federal preemption of state AI consumer protection laws.

The battle lines are drawn. The outcomes are not.

---

## The International Picture

### China: A Different Model

China's AI governance operates through administrative filing and content labeling rather than litigation and procurement.

Generative AI services that could influence public opinion must register with regulators and undergo security assessments. As of November 2025, over 600 generative AI services had completed this process. In September, labeling requirements took effect: AI-generated content must include visible indicators, embedded metadata identifying the source and provider, and platforms must verify labels before distribution. Tampering with labels is prohibited.

This is architecturally different from the American approach. China embeds provenance requirements into the product itself. The United States focuses on documentation and assessment that exists alongside the product.

Meanwhile, China's open-source AI ecosystem has advanced rapidly. DeepSeek's V3 model matched or exceeded leading proprietary systems on major benchmarks while being freely available. Qwen, Yi, and other Chinese labs have released competitive open-weight models under permissive licenses. The Chinese AI research community is producing frontier-class work under a regulatory regime that requires registration and labeling—not the disclosure and procurement requirements that dominate American policy.

The divergence is instructive. Two different governance philosophies are producing capable AI systems. The question of which approach better serves users, developers, and society remains open.

### European Union: Implementation Begins

The EU AI Act passed in 2024 and began taking effect in 2025.

Prohibitions on "unacceptable risk" AI—including social scoring and certain biometric identification systems—took effect in February. Requirements for general-purpose AI models, including transparency obligations and copyright compliance, took effect in August. Requirements for high-risk AI systems begin phasing in during August 2026.

For teams selling into the EU, the key question is whether your systems qualify as "high-risk" under the Act's classification scheme. If they do, conformity assessments and documentation requirements apply. The implementing regulations clarifying these details are still being finalized.

---

## The Technical Context

While regulators wrote rules, the technology moved.

The major model releases of 2025 share a common characteristic: AI systems increasingly use tools, maintain context across extended interactions, and take actions in external environments.

OpenAI's GPT-5 emphasized reliable multi-step tool use—chaining dozens of calls in sequence—and introduced techniques for compacting context to extend effective memory. Anthropic's Claude 4 combined extended reasoning with interleaved tool use, allowing the model to alternate between thinking and acting. Google's Gemini 3 offered direct access to development environments for agentic tasks. Meta's Llama 4 pushed context length to 10 million tokens, enabling approaches that previously required external retrieval systems.

Regulations written for single-turn text generation don't fully capture systems that plan, use tools, and modify external state. When a model can browse the web, execute code, or call APIs, "output" means something different than when it only generates text.

This matters for testing and compliance. Evaluating whether a model "hallucinates" differs from evaluating whether an agent selects the right tool, interprets its output correctly, handles errors appropriately, and takes actions aligned with user intent.

### Security as a Compliance Property

As AI systems gain capabilities, they also gain attack surface.

The UK's National Cyber Security Centre published guidance in 2025 observing that prompt injection—where malicious input causes a system to behave unexpectedly—differs from traditional injection attacks. In SQL injection, there's a clear boundary between code and data. In language model systems, that boundary doesn't exist in the same way.

The Open Web Application Security Project lists prompt injection as the top risk in its LLM security guidance.

If your system reads untrusted input—user documents, web pages, API responses—its outputs can be manipulated by that input. "Truthful outputs" isn't just an alignment property. It's a security property. Testing needs to cover adversarial conditions, not just cooperative ones.

---

## What's Coming in 2026

Based on the 2025 orders and legislation, specific deadlines and expected developments:

**January:** The DOJ AI Litigation Task Force must be established. California's AB 2013 (training data transparency) and Texas HB 149 take effect.

**March:** The Commerce Department's evaluation of state laws is due. Agencies must update LLM procurement policies per OMB M-26-04.

**June:** The FCC must initiate a proceeding on federal disclosure standards. The FTC must issue a policy statement on when state "truthful outputs" requirements are preempted. Colorado's SB24-205 compliance deadline arrives.

**August:** California's SB 942 (AI detection tools) takes effect. EU AI Act high-risk requirements begin phasing in.

**Expected but not scheduled:** Federal preemption litigation against specific state laws. Possible congressional action on a federal AI framework. Continued development of documentation standards for model cards and evaluation reports.

---

## What This Means for Builders

Three practical implications emerge from the 2025 landscape.

**Documentation is now structural, not optional.** Whether you're responding to a federal RFP, complying with a state law, or satisfying an enterprise security questionnaire, you'll be asked to provide documentation about how your system works and how you tested it. The specific requirements vary, but the common elements include: a description of what the system does and doesn't do, information about training data or knowledge sources, results from evaluations, and processes for monitoring and incident response.

If you don't have this documentation, you'll need to create it. If it exists but is scattered across internal wikis and chat threads, you'll need to consolidate it into formats that external reviewers can use.

**Testing needs to cover the deployed system, not just the base model.** Regulatory requirements increasingly focus on use cases and deployments—the combination of model, prompts, tools, retrieval, and guardrails that users actually interact with. Benchmarking a base model tells you something, but it doesn't tell you how your system behaves in production. If your application uses retrieval, test retrieval quality. If it uses tools, test tool selection and error handling. If it maintains context across turns, test behavior at different context lengths.

**Uncertainty is the operating condition.** The federal-state conflict isn't resolved. Preemption litigation hasn't happened. The FCC proceeding hasn't concluded. International requirements continue to diverge. Building compliance infrastructure that can adapt to different requirements is more practical than optimizing for any single regulatory regime.

---

## Our Perspective

We build Promptfoo because teams need to test AI systems—not just run benchmarks on base models.

The developments of 2025 reinforced something we already believed: if you're shipping AI systems, you need to be able to answer basic questions about how they behave. What happens when users ask about sensitive topics? How does the system perform with adversarial input? Does this prompt change make things better or worse?

These questions matter regardless of compliance requirements. But compliance requirements make them urgent. The testing infrastructure that helps you iterate with confidence is the same infrastructure that produces evidence for auditors, procurement officers, and legal teams.

We think testing should be a continuous engineering practice, not a launch gate or an annual audit. If you're navigating these requirements and want to talk about what to test or how to document it, we're happy to help.

---

## Sources

**Federal Policy**
- [Executive Order on AI Preemption](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/) (December 2025)
- [OMB M-26-04: Unbiased AI Principles](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf) (December 2025)
- [Executive Order 14319](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/) (July 2025)
- [Biden EO 14110](https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2023/10/30/executive-order-on-the-safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence/) (October 2023, archived)

**State Laws**
- [Colorado SB24-205](https://leg.colorado.gov/bills/sb24-205)
- [California SB 53](https://legiscan.com/CA/text/SB53/id/3271094)
- [NYC Local Law 144 Enforcement](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools)

**International**
- [China AIGC Labeling Measures](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) (Chinese)
- [CSET: China Basic Safety Requirements Translation](https://cset.georgetown.edu/wp-content/uploads/t0588_generative_AI_safety_EN.pdf)

**Technical**
- [NCSC: Prompt Injection Guidance](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

**News**
- [Reuters: Trump AI Order Faces Hurdles](https://www.reuters.com/legal/government/trumps-ai-order-faces-political-legal-hurdles-2025-12-12/)
- [Reuters: State AGs Warn AI Companies](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/)
