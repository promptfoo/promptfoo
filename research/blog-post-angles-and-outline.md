# Blog Post Strategy: 2025 AI Policy Year in Review

## The Core Insight (What Makes This Post Different)

Most AI policy coverage in 2025 fell into two camps:
1. **Industry cheerleading:** "Regulation bad, innovation good"
2. **Safety doomerism:** "We need to slow down before it's too late"

Neither is useful for builders. Your angle should be:

> **"Here's what actually changed in 2025, what it means for how you build and ship AI systems, and what the eval/testing implications are."**

This is educational, non-partisan, and naturally ties to Promptfoo's mission without being a product pitch.

---

## Three Viable Angles (Pick One)

### Angle 1: "The Year 'Truth' Became a Compliance Category"

**Thesis:** In 2025, "truthful outputs" went from an ML research concept to a legal/contractual requirement. This has profound implications for how AI systems must be built, tested, and documented.

**Structure:**
1. **The December 2025 EO** as the culmination of a year-long shift
2. **The three meanings of "truth"** in policy (factual, decisional, psychological)
3. **China's parallel move** to mandatory content labeling/provenance
4. **What changed technically** in 2025 models (tool use, long context, agents)
5. **Why eval infrastructure is now compliance infrastructure**
6. **2026 predictions:** disclosure standards, preemption litigation, child safety carve-outs

**Promptfoo tie-in:** If "truthful outputs" is a contract term, you need reproducible evidence. That's what eval frameworks provide.

**Best for:** HN audience that wants technical depth + policy context

---

### Angle 2: "The Stack Swap: How U.S. AI Policy Changed Hands in 2025"

**Thesis:** The policy *mechanism* (OMB memos → procurement → contract clauses) stayed the same between Biden and Trump. What changed was the *definition of risk*.

**Structure:**
1. **The Biden stack** (EO 14110 → M-24-10 → M-24-18): safety-impacting, rights-impacting, due process
2. **The rescission** (Jan 20, 2025) and what it actually removed
3. **The Trump stack** (EO 14179 → M-25-21/22 → EO 14319 → M-26-04): high-impact, ideological neutrality, truth-seeking
4. **The December surprise:** preemption as the new policy lever
5. **China's different architecture:** filing + labeling + administrative enforcement
6. **What stayed the same:** procurement as the real governance engine

**Promptfoo tie-in:** Regardless of which administration, the trend is toward auditable artifacts. Eval results are becoming compliance documentation.

**Best for:** LinkedIn audience that wants to understand the institutional mechanics

---

### Angle 3: "What 2025 Model Releases Changed About What 'Truth' Even Means"

**Thesis:** Policy people are arguing about "truthful outputs" using definitions from 2023. Meanwhile, 2025 models fundamentally changed what truth means technically—it's now a systems property, not a model property.

**Structure:**
1. **The policy debate** (EO's "truthful outputs" vs. state AG's "delusional outputs")
2. **GPT-5/5.2:** Tool chaining, context compaction, "with search vs. without search" factuality
3. **Claude 4:** Extended thinking + tool use, tool discovery as a truth bottleneck
4. **Gemini 3:** Agentic access, prompt injection resistance as "security"
5. **The open-weight story:** Llama 4 (10M context), Qwen3, DeepSeek V3.2
6. **Why policy is lagging:** Regulators are writing rules for chatbots while labs ship agents
7. **The security reality:** Truth is attackable (prompt injection, tool manipulation)

**Promptfoo tie-in:** Testing "truthful outputs" now means testing tool selection, retrieval quality, context management, and injection resistance—not just factual accuracy.

**Best for:** Technical audience that wants to understand the gap between policy language and engineering reality

---

## My Recommendation: Combine Angles 1 + 2 + 3 into a Narrative Arc

**Title options:**
- "2025: The Year AI Policy Discovered 'Truth'"
- "What 'Truthful Outputs' Actually Means Now"
- "The AI Policy Stack Swap: A 2025 Year in Review"
- "From Biden to Trump: How AI Governance Changed (And Didn't)"

**Narrative structure:**

### Part 1: The Policy Layer (What Happened)
- Biden EO 14110 created a safety/rights framework
- Trump EOs replaced it with innovation/neutrality framework
- December 2025 EO added preemption as a federal weapon
- Meanwhile, China built a completely different architecture (filing + labeling)

### Part 2: The Technical Layer (Why It's Complicated)
- 2025 models are agents, not chatbots
- "Truth" is now tool selection + retrieval + context management
- You can't guarantee truthfulness when the system is attackable
- The state AGs' "delusional outputs" concern is a real product safety issue

### Part 3: The Compliance Layer (What Builders Need to Do)
- Procurement is governance: documentation, evals, and audit trails matter
- "Truthful outputs" will be a contract term by March 2026
- Testing needs to cover factuality, tool use, injection resistance, and sycophancy
- The critics are right that "truth" is gameable—which is why evidence matters more than claims

### Part 4: What's Coming in 2026
- Preemption litigation (DOJ task force is real)
- Federal disclosure standards (FCC proceeding ordered)
- Child safety as the shared priority
- System-level regulation (use cases, not models)

---

## Key Data Points to Include

### Policy Timeline (Anchor the Evolution)
| Date | Event |
|------|-------|
| Oct 2023 | Biden EO 14110 (safety/rights framework) |
| Mar 2024 | OMB M-24-10 (agency AI governance) |
| Sep 2024 | OMB M-24-18 (AI procurement) |
| Jan 20, 2025 | EO 14110 rescinded |
| Jan 23, 2025 | Trump EO 14179 (removing barriers) |
| Apr 3, 2025 | OMB M-25-21/22 (replacements) |
| Jul 23, 2025 | Trump EO 14319 (Unbiased AI Principles) |
| Sep 1, 2025 | China's labeling regime effective |
| Dec 9, 2025 | State AGs letter on "delusional outputs" |
| Dec 11, 2025 | Trump preemption EO + OMB M-26-04 |

### Model Releases (Show Technical Evolution)
| Model | Key Feature for "Truth" |
|-------|------------------------|
| GPT-5 | Dozens of chained tool calls |
| GPT-5.2 | Context compaction; factuality with/without search |
| Claude 4 | Extended thinking + tool use |
| Gemini 3 | 1M context; prompt injection resistance |
| Llama 4 Scout | 10M token context |
| DeepSeek V3.2 | "Thinking in tool-use" |

### State Laws at Risk (Preemption Targets)
| Law | Why It's Targeted |
|-----|------------------|
| Colorado SB24-205 | Algorithmic discrimination (named in EO) |
| California SB 53 | Frontier model reporting |
| California AB 2013 | Training data transparency |
| California SB 942 | AI detection tools |
| NYC LL144 | Employment AI audits |

---

## Promptfoo Tie-Ins (Natural, Not Forced)

1. **"Truthful outputs" as a compliance requirement:**
   > "If federal contracts require evidence of truthfulness, you need reproducible evals—not marketing claims."

2. **Testing the full system, not just the model:**
   > "2025 models are agents. Testing 'truthfulness' means testing tool selection, retrieval, context management, and injection resistance."

3. **Red-teaming as security, not theater:**
   > "The state AGs' letter reads like a vulnerability disclosure program. Incident logging, response timelines, pre-release testing—these are security practices adapted to model behavior."

4. **The audit trail matters:**
   > "Whether you're selling to the government or defending against an FTC complaint, the question is the same: can you show your work?"

---

## Suggested Opening (Hook)

**Option A (The Irony):**
> In December 2025, two things happened in the same week. The White House issued an executive order directing the DOJ to challenge state AI laws that force models to "alter truthful outputs." And a coalition of state Attorneys General sent letters to AI companies demanding audits and testing for "delusional outputs."
>
> Same word. Opposite meanings. Welcome to AI policy in 2025.

**Option B (The Engineering Angle):**
> "Truthful outputs" is now a legal term. It appears in executive orders, procurement contracts, and preemption arguments. But ask five engineers what it means, and you'll get five different answers—none of which match what the lawyers think they're regulating.
>
> This post is about that gap.

**Option C (The Year-in-Review):**
> 2025 was the year AI policy discovered "truth."
>
> Not truth as philosophers understand it. Not truth as ML researchers measure it. Truth as a compliance category—something you can be audited for, sued over, and required to prove.
>
> Here's what changed, what it means, and what's coming next.

---

## Suggested Closing (CTA)

**Option A (Forward-looking):**
> In 2026, "truthful outputs" won't be a values statement. It will be a contract term with termination clauses.
>
> The companies that thrive will be the ones that can produce evidence—not claims. Reproducible evals. Documented test suites. Regression tracking. Audit trails.
>
> That's not responsible AI theater. That's compliance infrastructure.

**Option B (Community invitation):**
> We're building Promptfoo to help teams test what actually matters: factuality, tool use, injection resistance, and the behaviors that turn into liability.
>
> If you're navigating this new compliance landscape, we'd love to hear what you're testing for—and what's missing.

---

## What NOT to Do

1. **Don't make it a product pitch.** The tie-in should feel earned, not forced.
2. **Don't take a partisan side.** Analyze the mechanisms, not the motives.
3. **Don't oversimplify.** Your audience is smart. Trust them with complexity.
4. **Don't predict doom or triumph.** Predictions should be specific and evidence-based.
5. **Don't ignore the critics.** The "truth is gameable" argument is real and should be acknowledged.

---

## Estimated Length

- **LinkedIn version:** 1,500–2,000 words (the "thought piece")
- **Full blog version:** 3,500–5,000 words (the "definitive guide")
- **HN submission:** Link to full blog with a 2-sentence summary

---

## Next Steps

1. **Pick your primary angle** (I recommend the combined narrative arc)
2. **Choose your opening hook** (Option A or C are strongest)
3. **Draft the structure** based on the four-part narrative
4. **Pull quotes and citations** from the 8 research documents
5. **Write the Promptfoo section last** (so it feels natural, not forced)

Want me to draft a full outline or start writing a specific section?
