# How AI Regulation Changed in 2025

In 2025, AI regulation stopped being theoretical and became operational.

Executive orders became procurement requirements. Procurement requirements became contract clauses. If you're building AI systems—especially if you're selling to enterprises or government—this shift affects how you document, test, and ship your work.

This post explains what changed, how the pieces connect, and what's coming in 2026.

---

## The Big Picture

Two years ago, "AI regulation" meant debating whether to pause frontier model training or create new federal agencies. Those debates continued in 2025, but they weren't the main event.

What actually happened was more mundane and more consequential: governments started writing AI requirements into contracts, procurement rules, and compliance frameworks. The machinery of accountability got built.

Three things drove this:

1. **Federal policy changed hands.** The Biden administration's AI safety framework was rescinded in January 2025. The Trump administration replaced it with a different framework—same mechanism, different priorities.

2. **States kept legislating.** Colorado, California, Texas, and others passed AI laws covering everything from algorithmic discrimination to training data transparency. By year's end, the federal government announced a strategy to challenge some of these laws.

3. **The technology kept moving.** While regulators wrote rules for chatbots, labs shipped agents—systems that use tools, maintain long context, and take actions in external environments. The gap between what policy covers and what systems do continued to widen.

For builders, the practical implication is straightforward: you're increasingly expected to document how your AI systems behave and demonstrate that you've tested them. Whether that expectation comes from a government contract, a state law, an enterprise buyer, or an insurance policy varies—but the expectation itself is now structural.

---

## What Happened at the Federal Level

### The Policy Swap

The Biden administration issued Executive Order 14110 in October 2023, establishing a framework for "safe, secure, and trustworthy" AI. It created categories like "rights-impacting" and "safety-impacting" AI, required federal agencies to implement minimum risk-management practices, and used the Defense Production Act to require reporting from developers of large AI models.

That order was rescinded on January 20, 2025—day one of the new administration.

The Trump administration issued a replacement order (EO 14179) three days later, reframing federal AI policy around "removing barriers" and "American leadership." Over the following months, the Office of Management and Budget (OMB) issued new guidance replacing the Biden-era memos.

**What changed:**
- The category "rights-impacting AI" became "high-impact AI"—a subtle but meaningful shift in framing
- The compliance timeline extended from immediate to 365 days
- The requirement for frontier model developers to report to the government (including information about model weights) was removed
- The overall posture shifted from risk management to innovation promotion

**What stayed the same:**
- The mechanism: executive order → OMB guidance → procurement requirements → contract clauses
- Minimum practices for high-risk AI: pre-deployment testing, impact assessments, human oversight
- The requirement that agencies maintain inventories of AI use cases
- The expectation that vendors provide documentation to support agency compliance

The continuity matters as much as the change. Regardless of which administration is in power, federal AI governance now flows through procurement. If you want to sell AI to the government, you need to provide evidence that your system works as claimed.

### July 2025: Requirements for Language Models

In July, the administration added requirements specific to large language models (LLMs) purchased by federal agencies.

Executive Order 14319 established two "Unbiased AI Principles":
- **Truth-seeking:** LLMs should provide accurate responses to factual queries and acknowledge uncertainty when appropriate
- **Ideological neutrality:** LLMs should not encode partisan viewpoints into outputs unless specifically prompted

In December, OMB issued implementing guidance (M-26-04) specifying what agencies must request when purchasing LLMs:
- Acceptable use policies
- Model cards or system cards (documentation of training, capabilities, and limitations)
- Evaluation results
- A mechanism for users to report problematic outputs

Agencies must update their procurement policies by March 2026.

**What this means practically:** If you're selling an LLM or LLM-based product to federal agencies, you'll need to provide documentation that wasn't required before. The specifics—what counts as a "model card," what evaluations are sufficient—are still being worked out, but the direction is clear.

### December 2025: The Preemption Strategy

On December 11, the administration issued an executive order establishing a federal strategy to challenge state AI laws.

The order does several things:

**Creates a litigation task force.** The Department of Justice must establish an "AI Litigation Task Force" to challenge state laws that conflict with federal policy. Grounds for challenge include preemption by federal law, interference with interstate commerce, and constitutional violations.

**Requires an evaluation of state laws.** The Department of Commerce must publish an assessment identifying state laws that require AI systems to "alter their truthful outputs" or compel disclosures that might violate the First Amendment.

**Authorizes funding conditions.** Federal agencies may condition discretionary grants on states agreeing not to enforce identified AI laws.

**Initiates a federal disclosure standard.** The Federal Communications Commission (FCC) must begin a proceeding to determine whether to create a federal AI disclosure standard that would preempt conflicting state requirements.

**Requests an FTC policy statement.** The Federal Trade Commission (FTC) must explain when state laws requiring changes to AI outputs are preempted by federal consumer protection law.

The order specifically names Colorado's algorithmic discrimination law as an example of state overreach, arguing it could "force AI models to produce false results."

**What this means practically:** The federal government is asserting that it—not states—should set AI policy. Whether this succeeds depends on litigation outcomes and congressional action. In the near term, it creates uncertainty: state laws remain on the books, but their enforceability is now contested.

---

## What Happened at the State Level

While federal policy debated frameworks, states passed laws.

### The Major Laws

**Colorado (SB24-205):** Requires developers and deployers of "high-risk" AI systems to use reasonable care to avoid "algorithmic discrimination"—defined as differential treatment or impact that disfavors people based on protected characteristics. Deployers must conduct impact assessments and provide consumer notices. Originally effective in 2025, delayed to **June 2026**.

**California (SB 53):** Requires developers of large frontier AI models to publish safety frameworks, conduct risk assessments for catastrophic risks, and report certain incidents. Signed **September 2025**.

**California (AB 2013):** Requires developers of generative AI systems to publish documentation about their training datasets. Effective **January 2026**.

**California (SB 942):** Requires providers of generative AI systems to offer detection tools and content provenance features. Effective **August 2026** (delayed).

**New York City (Local Law 144):** Requires employers using automated tools for hiring decisions to obtain independent bias audits and notify candidates. In effect since **July 2023**.

**Texas (HB 149):** Establishes prohibited AI practices, creates a regulatory sandbox, and requires state agencies to disclose AI use. Effective **January 2026**.

### The Tension

The federal preemption order and state laws reflect a genuine disagreement about what AI regulation should accomplish.

The federal position frames some state requirements as forcing AI systems to be "untruthful"—for example, by requiring outputs that avoid disparate impact on protected groups. From this view, accuracy and non-discrimination can conflict, and accuracy should win.

The state position frames the same requirements as consumer protection—preventing AI systems from producing discriminatory outcomes. From this view, a system that produces disparate impact is already causing harm, regardless of whether individual outputs are "accurate."

This isn't a technical question. It's a policy question about what AI systems should optimize for and who gets to decide.

**What this means practically:** For the next year or more, you may face conflicting requirements depending on where you operate and who you sell to. Federal contracts will emphasize one set of values; some state laws will emphasize another. The litigation and rulemaking that resolve this tension haven't happened yet.

---

## What Happened Internationally

### China: A Different Model

China's AI governance operates differently than the U.S. system.

Rather than litigation and procurement, China uses **administrative filing and content labeling**. Generative AI services that could influence public opinion must register with regulators and undergo security assessments. As of November 2025, over 600 generative AI services had completed this process.

In September 2025, China's labeling requirements took effect. AI-generated content must include:
- **Explicit labels:** Visible indicators that content is AI-generated
- **Implicit labels:** Metadata embedded in files identifying the source and provider
- **Platform verification:** Distribution platforms must check for labels and add their own

Tampering with labels is prohibited. Providers must retain logs for at least six months.

**Why this matters for U.S. builders:** If you operate in China or serve Chinese users, compliance requires building provenance infrastructure into your product—not as documentation, but as a feature. This is architecturally different from the U.S. approach, which focuses on disclosure and assessment rather than embedded labeling.

### EU: Implementation Begins

The EU AI Act passed in 2024. Implementation milestones in 2025-2026:
- **February 2025:** Prohibitions on "unacceptable risk" AI (social scoring, certain biometric identification) took effect
- **August 2025:** Requirements for general-purpose AI models took effect
- **August 2026:** Requirements for high-risk AI systems begin phasing in

**Why this matters for U.S. builders:** If you sell into the EU, you'll need to determine whether your systems qualify as "high-risk" under the Act and, if so, comply with conformity assessment requirements. The details are still being clarified through implementing regulations.

---

## What Changed Technically

While policy developed, the technology moved.

The major model releases of 2025 share a common theme: AI systems increasingly use tools, maintain context across long interactions, and take actions in external environments.

- **GPT-5 and GPT-5.2** emphasized reliable tool use—chaining dozens of tool calls in sequence—and introduced "context compaction," where the system summarizes earlier context to fit more information in the window.
- **Claude 4** combined extended reasoning with tool use, allowing the model to alternate between thinking and taking actions.
- **Gemini 3** offered direct access to development environments (editor, terminal, browser) for agentic tasks.
- **Llama 4** pushed context length to 10 million tokens, enabling in-context approaches that previously required retrieval systems.

**Why this matters for compliance:** Regulations written for single-turn text generation don't fully capture systems that plan, use tools, and modify external state. When a system can browse the web, execute code, or call APIs, "output" means something different than when a system only generates text.

Testing requirements need to account for this. Evaluating whether a model "hallucinates" is different from evaluating whether an agent selects the right tool, interprets its output correctly, and takes appropriate action.

### Security Implications

As AI systems gain capabilities, they also gain attack surface.

The UK's National Cyber Security Centre published guidance in 2025 noting that prompt injection—where malicious input causes a system to behave unexpectedly—differs from traditional injection attacks. In SQL injection, there's a clear boundary between code and data. In LLM systems, that boundary doesn't exist in the same way.

OWASP (Open Web Application Security Project) lists prompt injection as the top risk in its LLM security guidance.

**Why this matters for compliance:** If your system reads untrusted input—user documents, web pages, API responses—its outputs can be manipulated by that input. "Truthful outputs" isn't just an alignment property; it's a security property. Testing needs to cover adversarial conditions, not just benign ones.

---

## What's Coming in 2026

Based on the 2025 orders and legislation, here are specific deadlines and expected developments:

**Q1 2026:**
- DOJ AI Litigation Task Force must be established (January)
- California AB 2013 (training data transparency) takes effect (January)
- Texas HB 149 takes effect (January)
- Commerce evaluation of state laws due (March)
- Agencies must update LLM procurement policies (March)

**Q2 2026:**
- FCC proceeding on federal disclosure standard must begin (June)
- FTC policy statement on "truthful outputs" preemption due (June)
- Colorado SB24-205 compliance date (June)

**Q3+ 2026:**
- California SB 942 takes effect (August)
- EU AI Act high-risk requirements begin phasing in (August)

**Expected but not scheduled:**
- Federal preemption litigation against specific state laws
- Congressional action on federal AI framework (uncertain)
- Standardization of documentation formats (model cards, eval reports)

---

## What This Means If You Build AI Systems

### Documentation is now expected, not optional

Whether you're responding to a federal RFP, complying with a state law, or satisfying an enterprise buyer's security questionnaire, you'll be asked to provide documentation about how your system works and how you tested it.

The specific requirements vary, but the common elements include:
- Description of what the system does and doesn't do
- Information about training data or knowledge sources
- Results from evaluations or red-teaming
- Processes for monitoring and incident response

If you don't have this documentation, you'll need to create it. If you have it but it's scattered across wikis and Slack threads, you'll need to consolidate it into formats that external reviewers can use.

### Testing needs to cover the system, not just the model

Regulatory requirements increasingly focus on deployed systems—the combination of model, prompts, tools, retrieval, and guardrails that users actually interact with.

Benchmarking a base model tells you something, but it doesn't tell you how your system behaves. If your application uses retrieval, you need to test retrieval quality. If it uses tools, you need to test tool selection and error handling. If it maintains context across turns, you need to test behavior at different context lengths.

The testing infrastructure that satisfies compliance requirements is the same infrastructure that helps you ship with confidence. These aren't separate problems.

### Uncertainty is the operating condition

The federal-state conflict isn't resolved. Preemption litigation hasn't happened. The FCC proceeding hasn't concluded. International requirements continue to diverge.

Building compliance infrastructure that adapts to different requirements is more practical than optimizing for any single regime. Documenting what you test, how you test it, and what you found is valuable regardless of which specific regulations apply.

---

## Our Perspective

We build Promptfoo because teams need to test AI systems—not just run benchmarks on base models.

The regulatory developments of 2025 reinforced something we already believed: if you're shipping AI systems, you need to be able to answer basic questions about how they behave. What happens when users ask about sensitive topics? How does the system perform with adversarial input? Does this prompt change make things better or worse?

These questions matter regardless of compliance requirements. But compliance requirements make them urgent. The same testing infrastructure that helps you iterate confidently is the infrastructure that produces evidence for auditors, procurement officers, and legal teams.

We think testing should be a continuous engineering practice, not a launch gate or an annual audit. If you're navigating these requirements and want to talk about what to test or how to document it, we're around.

---

## Sources and Further Reading

**Federal Policy:**
- [December 2025 Executive Order on AI Preemption](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/)
- [OMB M-26-04: Unbiased AI Principles](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf)
- [Executive Order 14319: Preventing Woke AI](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/)
- [Biden EO 14110 (archived)](https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2023/10/30/executive-order-on-the-safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence/)

**State Laws:**
- [Colorado SB24-205](https://leg.colorado.gov/bills/sb24-205)
- [California SB 53](https://legiscan.com/CA/text/SB53/id/3271094)
- [NYC Local Law 144](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools)

**International:**
- [China AIGC Labeling Measures (Chinese)](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm)
- [CSET Translation: China Basic Safety Requirements](https://cset.georgetown.edu/wp-content/uploads/t0588_generative_AI_safety_EN.pdf)

**Technical:**
- [NCSC: Prompt Injection Guidance](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

**News:**
- [Reuters: Trump AI Order Faces Hurdles](https://www.reuters.com/legal/government/trumps-ai-order-faces-political-legal-hurdles-2025-12-12/)
- [Reuters: State AGs Warn AI Companies](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/)
