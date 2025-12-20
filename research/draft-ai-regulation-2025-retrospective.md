# DRAFT: How AI Regulation Changed in 2025 and What to Look Forward to in 2026

*Multiple angle options included. Choose the framing that resonates.*

---

## Opening Options

### Opening A: The Structural Shift (Analytical)

A year ago, "AI regulation" meant debating whether frontier models should be paused, whether open weights were safe, and whether we needed new agencies. Those debates didn't disappear in 2025—but they stopped being the main event.

What actually happened was more structural: AI governance became operational. Executive orders became procurement requirements. Procurement requirements became contract clauses. Contract clauses became audit evidence. The machinery of compliance got built, and it's now shaping how AI systems get developed, tested, and deployed.

This post is a retrospective on what changed, why it matters, and what's coming next.

---

### Opening B: The Practitioner's View (Builder-Focused)

If you build AI systems, 2025 probably felt like whiplash.

In January, one administration's safety framework was in effect. By February, it was rescinded. By April, a new framework replaced it. By July, that framework got a politically charged addition. By December, a federal preemption strategy emerged to challenge state laws—some of which hadn't even gone into effect yet.

Meanwhile, your job stayed the same: ship products that work, don't break things, and somehow document enough to satisfy whoever asks.

This post cuts through the noise. Here's what actually changed in 2025, what it means for how you build, and what to watch in 2026.

---

### Opening C: The Global View (International Frame)

In 2025, three distinct AI governance models crystallized:

- **The United States** moved toward federal preemption, using litigation and procurement to shape the landscape
- **China** operationalized a filing-and-labeling regime, making provenance a first-class infrastructure concern
- **The European Union** began implementing the AI Act, with the first compliance deadlines landing

None of these models is "winning." They're different architectures, optimized for different values and political economies. For anyone building AI systems that cross borders, understanding these differences became essential in 2025.

This post maps what changed and what's coming.

---

## Part 1: The U.S. Federal Landscape

### The Stack Swap

The most important thing that happened in U.S. AI policy in 2025 wasn't any single regulation—it was a *stack swap*. The mechanism stayed the same (executive order → OMB memo → procurement requirements → contract clauses), but the priorities changed.

**The Biden Stack (2023-2024):**

| Layer | Document | Focus |
|-------|----------|-------|
| Policy | EO 14110 (Oct 2023) | Safety, security, trustworthiness |
| Agency Governance | M-24-10 (Mar 2024) | Rights-impacting, safety-impacting AI |
| Procurement | M-24-18 (Sep 2024) | Transparency, documentation, testing |

The Biden framework created categories like "rights-impacting" and "safety-impacting" AI, required agencies to implement minimum practices by December 2024, and demanded due-process style protections (notice, appeal, human consideration) for AI affecting individuals.

**The Rescission (January 20, 2025):**

EO 14110 was rescinded on day one of the new administration. This mattered because EO 14110 was the "parent authority" for the OMB memos—without it, the implementation stack lost its foundation.

**The Trump Stack (2025):**

| Layer | Document | Focus |
|-------|----------|-------|
| Policy | EO 14179 (Jan 2025) | Removing barriers, AI dominance |
| Agency Governance | M-25-21 (Apr 2025) | High-impact AI, reduced burden |
| Procurement | M-25-22 (Apr 2025) | Efficiency, competition, buy American |
| LLM-Specific | EO 14319 + M-26-04 (Jul/Dec 2025) | Truth-seeking, ideological neutrality |
| Preemption | Dec 2025 EO | Federal framework, state law challenges |

The Trump framework kept the OMB-centered implementation model but reframed the priorities: "high-impact" instead of "rights-impacting," pro-innovation posture, and—by December—an explicit strategy to challenge state AI laws.

### What Stayed the Same

Despite the rhetoric, some things persisted across administrations:

1. **Procurement as governance.** Both stacks use contract requirements to enforce policy. If you want to sell to the government, you need documentation, testing evidence, and audit trails.

2. **Minimum practices for high-risk AI.** The Trump framework's M-25-21 still requires pre-deployment testing, impact assessments, human oversight, and discontinuation of non-compliant systems. The timeline shifted (agencies get 365 days to document compliance), but the structure remained.

3. **Testing and monitoring requirements.** Both stacks require agencies to test AI systems and monitor performance. The specifics differ, but the expectation that you can "show your work" is bipartisan.

### What Changed

1. **The definition of risk.** "Rights-impacting" became "high-impact." "Safety-impacting" became less emphasized. The December 2025 EO introduced "truthful outputs" as a category for identifying state laws to challenge.

2. **The posture toward disclosure.** The Biden framework demanded significant disclosure from frontier model developers (including model weight possession and red-team results). The Trump procurement guidance explicitly avoids requiring weight disclosure where practicable.

3. **The federal-state relationship.** The Biden framework didn't build a machine to challenge state laws. The December 2025 EO does—with a DOJ litigation task force, Commerce evaluation of state laws, and potential funding restrictions for states with "onerous" AI regulations.

### The December Surprise: Preemption as Policy

The December 11, 2025 executive order represents a significant escalation. It:

- Creates an **AI Litigation Task Force** at DOJ to challenge state laws
- Directs Commerce to **evaluate state AI laws** and identify those that conflict with federal policy
- Authorizes agencies to **condition grant funding** on states not enforcing certain AI laws
- Directs the FCC to consider a **federal disclosure standard** that would preempt state requirements
- Directs the FTC to issue a policy statement on when state laws requiring changes to "truthful outputs" are preempted

This isn't just policy preference—it's a legal strategy. Whether it succeeds depends on how courts interpret preemption arguments, but the intent is clear: the federal government is asserting primacy over AI regulation.

---

## Part 2: The State Landscape

### The Patchwork Reality

While the federal government debated frameworks, states legislated. By the end of 2025, companies navigating AI compliance faced a genuine patchwork:

| Jurisdiction | Law | What It Requires | Status |
|--------------|-----|------------------|--------|
| **Colorado** | SB24-205 | Impact assessments, algorithmic discrimination prevention, consumer notices | Delayed to June 2026 |
| **California** | SB 53 | Frontier model safety frameworks, incident reporting | Signed Sep 2025 |
| **California** | AB 2013 | Training data transparency | Effective Jan 2026 |
| **California** | SB 942 | AI detection tools, content provenance | Delayed to Aug 2026 |
| **NYC** | LL144 | Bias audits for employment AI | In effect since Jul 2023 |
| **Texas** | HB 149 | Prohibited practices, regulatory sandbox | Effective Jan 2026 |
| **Utah** | SB 149 | Chatbot disclosure, high-risk interactions | Effective May 2024 |
| **Illinois** | Video Interview Act | Notice and consent for AI video analysis | In effect |

### Why the December EO Named Colorado

The December 2025 EO specifically calls out Colorado's SB24-205 as an example of state overreach, arguing it could "force AI models to produce false results in order to avoid a 'differential treatment or impact' on protected groups."

This is the core tension: the federal government frames some state requirements as compelling "untruthful" outputs, while states frame them as preventing discriminatory harm. Whether algorithmic fairness requirements constitute "lying" is not a technical question—it's a political and philosophical one.

### What's Actually at Risk

The laws most exposed to federal preemption challenges are those that:

1. **Mandate audits or assessments** (NYC LL144, Colorado SB24-205)
2. **Require output modifications** for fairness (Colorado's algorithmic discrimination provisions)
3. **Compel disclosures** that the federal government might characterize as compelled speech (California's various transparency laws)

The laws likely to survive are those in the EO's explicit carve-outs:
- Child safety protections
- State government procurement
- AI compute and data center infrastructure

### The State AG Response

On December 9, 2025—two days before the preemption EO—a coalition of state Attorneys General sent letters to major AI companies demanding:

- Pre-release safety tests for "sycophantic and delusional outputs"
- Independent third-party audits reviewable by regulators
- Incident logging and response timelines
- User notification for harmful output exposure

The timing wasn't coincidental. States are defending their regulatory authority while the federal government challenges it.

---

## Part 3: The International Context

### China: A Different Architecture

While U.S. debates centered on preemption and litigation, China operationalized a fundamentally different governance model:

**The Filing System:**
- Public-facing generative AI with "public opinion attributes" or "social mobilization capability" must undergo security assessment and algorithm filing
- As of November 2025: 611 filed generative AI services, 306 registered apps
- Filing isn't a one-time gate—it's ongoing visibility for regulators

**The Labeling Regime (Effective September 2025):**
- AI-generated content requires both explicit labels (visible to users) and implicit labels (embedded in metadata)
- Platforms must verify metadata and label content accordingly
- Digital watermarks are encouraged; label tampering is prohibited
- Six-month log retention required

**The Compliance Implication:**
For companies operating in China, compliance isn't about passing an audit—it's about building provenance infrastructure into the product. Metadata, watermarking, logging, and platform verification flows are architectural decisions, not bolt-ons.

### The EU: Implementation Begins

The EU AI Act passed in 2024, but 2025 was the year implementation timelines started to bite:

- **February 2025:** Prohibitions on unacceptable risk AI systems (social scoring, real-time biometric identification in public)
- **August 2025:** General-purpose AI model provisions and governance structures
- **2026:** High-risk AI system requirements begin phasing in

For global companies, this means navigating three distinct compliance architectures—each with different categories, requirements, and enforcement mechanisms.

---

## Part 4: What Changed Technically

### The Capabilities That Outpaced Policy

While regulators wrote rules for 2023-era systems, 2025 model releases changed what "AI system" even means:

| Model | Key Capability | Policy Implication |
|-------|---------------|-------------------|
| **GPT-5/5.2** | Reliable chaining of dozens of tool calls; context compaction | "Output" is now the result of tool orchestration, not just generation |
| **Claude 4** | Extended thinking with tool use; tool discovery at scale | Tool selection becomes a truth/accuracy bottleneck |
| **Gemini 3** | 1M token context; agentic access to editor/terminal/browser | The model can take actions, not just produce text |
| **Llama 4 Scout** | 10M token context | In-context "retrieval" changes what grounding means |
| **DeepSeek V3.2** | "Thinking in tool-use"; agent training synthesis | Truth becomes "what the environment returns when I act" |

### The Gap

Regulators are writing rules for chatbots. Labs are shipping agents.

This isn't a criticism—policy necessarily lags capabilities. But the implication for builders is clear: compliance requirements won't fully specify what you need to test. You need to understand your own system well enough to anticipate what will matter.

### What "Testing" Means Now

In 2023, testing an AI system mostly meant:
- Running benchmarks on the base model
- Checking outputs against a test set
- Maybe some red-teaming for jailbreaks

In 2025, testing a production AI system means:
- Evaluating tool selection and orchestration
- Verifying retrieval quality and relevance
- Measuring behavior across context lengths
- Testing resistance to prompt injection
- Tracking regression across model versions
- Documenting all of the above in auditable form

The surface area expanded dramatically. The testing infrastructure needs to match.

---

## Part 5: What We Expect in 2026

### Prediction 1: Preemption Litigation Accelerates

The DOJ AI Litigation Task Force exists. Commerce will publish its evaluation of state laws within 90 days of the December EO. The legal challenges will follow.

**What to watch:** Which state laws get challenged first, and on what grounds (preemption, interstate commerce, First Amendment). The outcomes will shape the federal-state balance for years.

### Prediction 2: Federal Disclosure Standards Emerge

The December EO directs the FCC to consider a federal reporting and disclosure standard that would preempt state requirements. This proceeding will begin in early 2026.

**What to watch:** Whether the standard is minimalist (preempting state requirements without replacing them) or substantive (creating federal disclosure obligations). The model card / system card format may become quasi-regulatory.

### Prediction 3: Child Safety Becomes the Shared Priority

Both the December EO (which carves out child safety from preemption) and the state AG letters (which emphasize protecting minors) prioritize children. The TAKE IT DOWN Act already passed with compliance deadlines in 2026.

**What to watch:** Additional federal legislation targeting AI and child safety. This is one of the few remaining bipartisan lanes.

### Prediction 4: System-Level Regulation Dominates

The FTC's 2025 enforcement actions (like Air AI) targeted product behavior and marketing claims, not model capabilities. Federal procurement requirements focus on "use cases" and "deployments." State laws increasingly regulate applications, not models.

**What to watch:** Whether model-level governance (frontier model reporting, training run disclosure) fades in favor of deployment-focused requirements. The regulatory center of gravity is moving downstream.

### Prediction 5: Testing Evidence Becomes Table Stakes

Federal procurement now requires documentation of testing, red-teaming, and mitigation. State laws require impact assessments. Insurance underwriters and enterprise buyers are following suit.

**What to watch:** The emergence of standard formats for testing evidence. "Model cards" exist; "eval reports" and "safety cases" may standardize next.

---

## Part 6: What This Means for Builders

### The Practical Reality

Regardless of your views on any specific regulation, here's what 2025 made clear:

1. **You will be asked to show your work.** Whether it's a procurement officer, a state AG, an enterprise buyer, or an insurance underwriter, someone will want evidence that you tested your system. "We take safety seriously" is not evidence.

2. **Testing the model isn't testing the system.** Your production system includes prompts, tools, retrieval, context management, and guardrails. Benchmarking the base model tells you almost nothing about how the system behaves.

3. **The attack surface is different now.** Prompt injection, tool manipulation, and context poisoning are not theoretical—they're practical threats to system integrity. Testing for them isn't optional.

4. **Documentation is debt you pay now or later.** Building audit trails, version tracking, and reproducible evals into your workflow is annoying. Reconstructing them during a compliance review or litigation is worse.

5. **Uncertainty is the risk.** The federal-state conflict, the preemption litigation, the varying international requirements—none of this resolves cleanly in 2026. Building adaptable compliance infrastructure matters more than optimizing for any single regulatory regime.

### The Promptfoo Perspective

We built Promptfoo because we needed it ourselves—and because we kept hearing the same questions from teams navigating these requirements:

- "How do we know if this prompt change made things worse?"
- "Can we prove we tested for [X] before deployment?"
- "How do we track regression across model versions?"
- "What does 'good enough' even look like?"

These aren't compliance questions in the narrow sense. They're engineering questions that compliance requirements have made urgent.

Our view: the testing infrastructure that lets you iterate with confidence is the same infrastructure that satisfies auditors. Building it well serves both purposes. Building it poorly—or not building it at all—creates risk on both fronts.

2025 made testing infrastructure non-optional. 2026 will make it competitive.

---

## Closing Options

### Closing A: The Builder's Takeaway

AI regulation in 2025 was messy, political, and incomplete. It will be messier in 2026.

But underneath the noise, a structural shift happened: the expectation that you can demonstrate your system works—and document how you tested it—is now embedded in how AI gets bought, deployed, and defended.

That expectation isn't going away. Building the infrastructure to meet it is no longer optional.

---

### Closing B: The Forward Look

We're entering 2026 with:
- A federal government asserting preemption authority
- States defending their regulatory role
- International regimes diverging further
- Capabilities continuing to outpace policy

The companies that navigate this well won't be the ones that predict exactly what regulations will require. They'll be the ones that understand their systems well enough to adapt—and can prove it.

---

### Closing C: The Call to Action

If you're building AI systems, the question for 2026 isn't "what will regulators require?" It's "what do I need to know about my own system to confidently ship it?"

The regulatory landscape will keep shifting. Your testing infrastructure shouldn't.

---

## Appendix: Key Sources

### U.S. Federal
- [Biden EO 14110](https://bidenwhitehouse.archives.gov/briefing-room/presidential-actions/2023/10/30/executive-order-on-the-safe-secure-and-trustworthy-development-and-use-of-artificial-intelligence/) (Oct 2023)
- [Trump EO 14179](https://www.federalregister.gov/documents/2025/01/31/2025-02172/removing-barriers-to-american-leadership-in-artificial-intelligence) (Jan 2025)
- [Trump EO 14319](https://www.whitehouse.gov/presidential-actions/2025/07/preventing-woke-ai-in-the-federal-government/) (Jul 2025)
- [December 2025 Preemption EO](https://www.whitehouse.gov/presidential-actions/2025/12/eliminating-state-law-obstruction-of-national-artificial-intelligence-policy/)
- [OMB M-26-04](https://www.whitehouse.gov/wp-content/uploads/2025/12/M-26-04-Increasing-Public-Trust-in-Artificial-Intelligence-Through-Unbiased-AI-Principles-1.pdf)

### State Laws
- [Colorado SB24-205](https://leg.colorado.gov/bills/sb24-205)
- [California SB 53](https://legiscan.com/CA/text/SB53/id/3271094)
- [NYC LL144](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools)

### China
- [AIGC Labeling Measures](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm)
- [CAC Filing Announcements](https://www.cac.gov.cn/2025-11/11/c_1764585284364412.htm)
- [CSET Translation: Basic Safety Requirements](https://cset.georgetown.edu/wp-content/uploads/t0588_generative_AI_safety_EN.pdf)

### Technical
- [OpenAI: Why Language Models Hallucinate](https://openai.com/index/why-language-models-hallucinate/)
- [Anthropic: Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- [NCSC: Prompt Injection Is Not SQL Injection](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection)
- [OWASP Top 10 for LLMs 2025](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

### News Coverage
- [Reuters: Trump's AI Order Faces Political, Legal Hurdles](https://www.reuters.com/legal/government/trumps-ai-order-faces-political-legal-hurdles-2025-12-12/)
- [Reuters: State AGs Warn AI Companies](https://www.reuters.com/business/retail-consumer/microsoft-meta-google-apple-warned-over-ai-outputs-by-us-attorneys-general-2025-12-10/)
