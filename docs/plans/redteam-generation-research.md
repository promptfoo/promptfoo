# Red Team Attack Generation Research Plan

Status: active research
Started: 2026-05-09
Owner: Promptfoo red-team generation research loop

## Research Question

How should Promptfoo generate between 1 and 1000 high-quality attacks for a target
system when the available context may include:

- system purpose
- test generation instructions
- allowed entities
- input schemas and multi-input fields
- available tools
- target type (chatbot, RAG flow, coding agent, general tool-using agent)
- prior attacks, target responses, traces, and grader outcomes

The goal is not merely fluent adversarial prompts. The goal is to produce attacks
that are:

1. valid for the requested vulnerability type
2. well-grounded in the target system
3. diverse across tactics and attack surfaces
4. novel relative to obvious templates
5. likely to expose real failures downstream
6. measurable enough that we can hill climb generation quality over time

## Current Promptfoo Baseline

Promptfoo already has two distinct layers of attack construction:

1. **Plugin-side seed generation**
   - `src/redteam/plugins/base.ts` renders a prompt template, includes a few
     examples, asks for `n` prompts, retries for count/length issues, and
     deduplicates exact-ish repeats.
   - Most plugin templates still look like single-pass few-shot generation.
   - Representative examples:
     - `sqlInjection.ts`
     - `pii.ts`
     - `promptExtraction.ts`
     - `excessiveAgency.ts`

2. **Strategy/provider-side search**
   - `iterativeTree.ts` implements TAP-style tree search.
   - `iterativeMeta.ts` delegates strategic adaptation to a meta-agent.
   - `crescendo/` implements multi-turn escalation.
   - `hydra/`, `bestOfN.ts`, `goat.ts`, and others already explore more
     sophisticated downstream attack search.

The architectural gap is that the expensive downstream search often starts from
seed distributions that are still template-heavy and only lightly optimized for
coverage, novelty, and target grounding.

## Literature Takeaways

Primary-source anchors for the current research phase:

| Paper | Why it matters here |
| --- | --- |
| [PAIR](https://arxiv.org/abs/2310.08419) | Iterative black-box refinement can find semantic jailbreaks in fewer than twenty queries. |
| [TAP](https://arxiv.org/abs/2312.02119) | Tree search plus pruning improves success while reducing wasted target queries. |
| [GPTFuzz](https://arxiv.org/abs/2309.10253) | Mutation over seed prompts can scale diversity and effectiveness better than hand-authored templates alone. |
| [AutoDAN-Turbo](https://arxiv.org/abs/2410.05295) | Strategy self-exploration is itself learnable; attack families should be discovered, not only enumerated manually. |
| [Crescendo](https://arxiv.org/abs/2404.01833) | Multi-turn escalation is qualitatively different from single-turn jailbreak prompting. |
| [AgentDojo](https://arxiv.org/abs/2406.13352) | Agent benchmarks need realistic tasks, untrusted data, tools, and adaptive attacks rather than static prompt sets. |
| [InjecAgent](https://arxiv.org/abs/2403.02691) | Indirect prompt injection should be measured over realistic tool-integrated agents and attack intentions such as harm and exfiltration. |
| [ToolEmu](https://arxiv.org/abs/2309.15817) | Long-tail agent risks can be explored with emulated tools and automatic evaluators, not only hand-built integrations. |

The literature points toward four design principles for Promptfoo:

1. Generate **families of attacks**, not just lists of prompts.
2. Treat generation as **search under constraints**, not one-shot completion.
3. Measure quality at both the **prompt level** and the **environment/outcome level**.
4. Use the target context aggressively: purpose, tools, entities, fields, traces,
   prior failures, and prior successes are all signal.

## Initial Hypotheses

### H1. Taxonomy-guided coverage beats homogeneous few-shot sampling

For plugins such as `sql-injection`, generation quality should improve if we
first sample a tactic plan across attack families and only then instantiate
prompts. Example SQL families:

- boolean bypass
- stacked query
- union extraction
- schema discovery
- authorization-filter removal
- natural-language privilege escalation

### H2. Retrieval-conditioned mutation beats raw few-shot prompting

Given prior successful attacks, we should retrieve structurally relevant seeds
and mutate them across dimensions such as:

- role
- target surface
- entity
- channel
- obfuscation
- escalation pattern
- target-specific jargon

This is the Promptfoo analogue of GPTFuzz, but conditioned on target context.

### H3. Critique-and-repair should run before target execution

Before spending target probes, an attack candidate can be critiqued for:

- plugin validity
- target grounding
- novelty
- tactic uniqueness
- realism
- likely grader discriminability

Weak candidates should be repaired or discarded before execution.

### H4. Multi-agent generation should separate roles

A single model asked to both invent and judge prompts often converges on obvious
patterns. A stronger workflow may split:

- planner: chooses coverage goals
- generator: writes candidate attacks
- critic: scores validity, realism, novelty, and exploit specificity
- mutator: repairs or diversifies low-scoring candidates
- curator: chooses a set under a diversity budget

### H5. Agentic attacks need environment-aware generation

For agents, a good attack is often a **scenario**, not a sentence:

- untrusted email plus user task
- malicious document plus connector/tool affordance
- tool result carrying instructions
- multi-step action chain with exfiltration opportunity

Agentic generation should emit scenario specs and success predicates, not only
plain prompts.

### H6. A generator that optimizes only attack success will overfit

We need a multi-objective benchmark with at least:

- downstream success rate
- unique tactic coverage
- purpose grounding
- entity grounding
- lexical/semantic diversity
- novelty versus reference seeds
- cost per useful attack
- failure-mode coverage

## Generator Families To Explore

### 1. Taxonomy Planner + Instantiator

Pipeline:

1. choose tactic quotas
2. choose entities / fields / tools / channels
3. generate prompt skeletons
4. instantiate with target-specific details
5. dedupe and critique

Best for:

- `sql-injection`
- `pii`
- `prompt-extraction`
- `excessive-agency`

### 2. Retrieval-Augmented Mutator

Pipeline:

1. retrieve successful historical seeds by plugin and tactic
2. decompose the seed into reusable move types
3. mutate across target context and tactic dimensions
4. score novelty against the retrieved seed bank

Best for:

- plugin families with many prior examples
- scaling from tens to hundreds of attacks

### 3. Self-Critique / Repair Loop

Pipeline:

1. generate
2. critique against a rubric
3. repair invalid or weak candidates
4. select only candidates above threshold

Best for:

- expensive target evaluations
- cases where malformed attacks waste probes

### 4. Search-Based Curator

Pipeline:

1. over-generate candidates
2. embed / cluster / classify by tactic
3. select a Pareto frontier balancing quality and diversity
4. maintain a memory of what has already been tried

Best for:

- `n >= 50`
- regression suites that should remain broad over time

### 5. Scenario Generator For Agents

Pipeline:

1. choose task archetype
2. choose untrusted source and available tools
3. choose attacker goal
4. generate the environment artifact plus user request
5. derive success predicate and deterministic side-channel where possible

Best for:

- `indirect-prompt-injection`
- `data-exfil`
- coding-agent attacks
- connector / tool abuse

### 6. Target-Feedback Optimizer

Pipeline:

1. start from a curated attack set
2. execute against target
3. cluster near-misses and successes
4. mutate toward under-covered success regions
5. stop when marginal gain falls below threshold

Best for:

- live campaigns
- expensive but high-value targets

## Benchmark Design

### Representative Plugin Set

| Plugin family | Why include it |
| --- | --- |
| `sql-injection` | Structured exploit syntax plus natural-language auth-bypass requests |
| `pii:*` | Privacy boundary testing and social engineering |
| `prompt-extraction` | Instruction-boundary attacks |
| `excessive-agency` | Agent capability and tool-boundary misuse |
| `indirect-prompt-injection` | Untrusted-context attacks |
| `data-exfil` | Agentic success predicate with deterministic side-channel potential |

### Offline Metrics

Prompt-level metrics we can compute without touching a target:

- requested count vs generated count
- duplicate rate
- average length
- lexical diversity
- pairwise similarity / distance
- detected tactic coverage
- reference-seed overlap
- purpose-token grounding
- allowed-entity reference rate
- schema / multi-input validity

### Online Metrics

Outcome-level metrics that require execution:

- target attack success rate
- grader agreement rate
- near-miss rate
- tactic-specific success rate
- cost per successful attack
- success discovered per 10 / 50 / 100 generated prompts
- failure-mode coverage
- transfer across targets

### Scoring Philosophy

The benchmark should prefer a set that finds more distinct real failures over a
set that merely repeats one highly successful attack shape. A good generator
therefore optimizes a portfolio, not just a single prompt.

## First Experiment Ladder

1. **Baseline audit**
   - Analyze existing generated examples from
     `examples/redteam-medical-agent/redteam.yaml`.
   - Establish offline metrics for selected plugin families.

2. **Taxonomy-guided prototype**
   - Add tactic plans for one structured plugin (`sql-injection`) and one softer
     plugin (`prompt-extraction`).
   - Compare against baseline on tactic coverage and diversity.

3. **Critique-and-repair prototype**
   - Over-generate, score, repair, and select.
   - Measure useful-candidate yield.

4. **Retrieval + mutation prototype**
   - Build a small seed bank from current examples and successful attacks.
   - Measure novelty / diversity against seed-only generation.

5. **Agentic scenario prototype**
   - Start with `indirect-prompt-injection` and `data-exfil`.
   - Generate scenario objects, not just strings.

6. **Target-feedback loop**
   - Run against a live or simulated benchmark target and hill climb on actual
     downstream failures.

## Open Questions

1. What is the right abstraction for an attack: string, structured scenario, or
   search state?
2. Which quality judgments should be deterministic, LLM-judged, or outcome-based?
3. How much of tactic taxonomy should be handcrafted versus discovered?
4. Can one benchmark span chatbots, RAG, and agents without becoming meaningless?
5. Where should attack memory live so repeated campaigns improve over time?

## Immediate Next Steps

1. Build a deterministic analyzer over existing generated YAML.
2. Record the baseline metrics in the lab notebook.
3. Implement a tactic-aware generator prototype for `sql-injection`.
4. Compare one-shot generation, planner-guided generation, and over-generate +
   curate on the same benchmark.
