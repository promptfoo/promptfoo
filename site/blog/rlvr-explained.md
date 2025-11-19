---
title: 'Reinforcement Learning with Verifiable Rewards Makes Models Faster, Not Smarter'
description: 'RLVR trains reasoning models with programmatic verifiers instead of human labels. Recent research suggests most gains come from search compression rather than new capabilities. What actually works.'
authors: [michael]
tags: [technical-guide, best-practices, evaluation]
keywords:
  [
    RLVR,
    reinforcement learning verifiable rewards,
    AI training efficiency,
    verifiable rewards,
    LLM post-training,
    reasoning models,
    GRPO,
    verifier design,
    model evaluation,
  ]
date: 2025-10-24
image: /img/blog/rlvr/rlvr-header.jpg
---

If your model can solve a problem in 8 tries, RLVR trains it to succeed in 1 try. [Recent research](https://arxiv.org/abs/2504.13837) shows this is primarily search compression, not expanded reasoning capability. Training concentrates probability mass on paths the base model could already sample.

This matters because you need to measure what you're actually getting. Most RLVR gains come from sampling efficiency, with a smaller portion from true learning. This guide covers when RLVR works, three critical failure modes, and how to distinguish compression from capability expansion.

<!-- truncate -->

## What RLVR Is (and Isn't)

RLVR replaces learned reward models with programmatic verifiers:

```python
# Simplified example - production code needs error handling
def verifier(output: str, ground_truth: Any) -> float:
    """Returns 1.0 if correct, 0.0 if incorrect"""
    return 1.0 if check_correctness(output, ground_truth) else 0.0
```

This approach eliminates **reward model training** (skipping weeks of work on preference pairs) and provides **deterministic feedback** (same input always produces the same reward). You get **fast iteration** because verifier logic changes don't require retraining. Verifiers are **scalable** if engineered carefully, though SQL execution and unit tests can take seconds.

### Comparison to Other Methods

| Method   | Reward Signal      | Best For           | Major Limitation |
| -------- | ------------------ | ------------------ | ---------------- |
| **RLHF** | Human preferences  | Subjective quality | Expensive, slow  |
| **DPO**  | Preference pairs   | Style, tone        | Needs good pairs |
| **RLVR** | Programmatic check | Verifiable tasks   | Needs verifiers  |

_Note: This comparison focuses on post-training methods for reasoning models. Other approaches like RLAIF and Constitutional AI use different paradigms._

### The Training Loop

```text
1. Generate K candidate solutions for each prompt
   Input: "What is 37 × 29?"
   Outputs: [1073, 1072, 1073, 1074, 1073, 1071, 1073, 1073]

2. Verify each output
   Rewards: [1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 1.0]

3. Update policy to favor high-reward trajectories
   (Using GRPO or similar algorithm)

4. Repeat with new prompts
```

If 5 out of 8 attempts succeed, the model learns which reasoning paths led to correct answers.

### What RLVR Is NOT

RLVR works where ground truth exists. It fails for creative writing, brand voice, or nuanced argumentation. Human preference data remains superior for subjective quality. RLVR is standard reinforcement learning with deterministic reward functions (the technique isn't new, but applying it to LLM post-training at scale is).

## Recent Results

**Databricks Text2SQL:** [73.5% BIRD test accuracy reported in July](https://www.databricks.com/blog/power-rlvr-training-leading-sql-reasoning-model-databricks); a [later paper reports 75.68%](https://arxiv.org/abs/2509.21459) with few-sample self-consistency. Both use execution-based verifiers, not pattern matching.

**DeepSeek R1:** Scales GRPO with rule-based rewards (format compliance, verifiable correctness) for math, code, and logic. Details in the [R1 paper](https://arxiv.org/abs/2501.12948) and [Nature write-up](https://www.nature.com/articles/s41586-025-09422-z).

**OpenAI o3 and o4-mini:** [April 16, 2025, release](https://openai.com/index/introducing-o3-and-o4-mini/) emphasizes scaling RL and tool-use, with strong results on AIME, SWE-bench, and Codeforces. OpenAI's public materials do not provide HumanEval deltas.

**Compression vs capability:** [Tsinghua finds](https://arxiv.org/abs/2504.13837) RLVR mostly improves sampling efficiency rather than expanding the reasoning boundary; [Scale formalizes](https://arxiv.org/abs/2506.13923) "self-distillation" vs "capability gain."

## Common Failure Modes

<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', alignItems: 'center', margin: '2rem auto'}}>
  <div>
    <p>Three failure modes account for most RLVR problems. Unlike traditional RL issues, these stem from verifier design and the specific challenges of language model training.</p>
  </div>
  <div>
    <img src="/img/blog/rlvr/failure-modes.jpg" alt="RLVR Failure Modes" style={{width: '100%', height: 'auto', borderRadius: '8px'}} />
  </div>
</div>

### 1. Partial Verifiers Create Exploitable Gaps

**Your model will learn to cheat any test that isn't comprehensive.**

A verifier catching 60% of errors creates a 40% gap. Models find and exploit these gaps.

**Real Example from SQL Generation:**

```python
# Weak verifier: Only checks syntax
def weak_sql_verifier(sql_query):
    try:
        parse(sql_query)  # Just parses, doesn't execute
        return 1.0
    except:
        return 0.0

# Result: Models generate syntactically valid but wrong queries
# "SELECT * FROM users WHERE 1=1" gets reward 1.0
```

**Strong verifier: Execution-based:**

```python
def strong_sql_verifier(sql_query, expected_results, db_connection):
    try:
        actual = db_connection.execute(sql_query).fetchall()
        expected_set = set(map(tuple, expected_results))
        actual_set = set(map(tuple, actual))
        return 1.0 if actual_set == expected_set else 0.0
    except:
        return 0.0
```

**Mitigation:** Build adversarial test suites for verifiers and measure false negative rates on known-bad outputs. Add secondary checks like intent verification and format validation to catch what execution testing misses.

### 2. Spurious Rewards: Models Improve with Random Signals

**Your gains might be an accidental side effect of training, not a result of your verifier.**

[Research from June 2025](https://arxiv.org/abs/2506.10947) found Qwen2.5-Math-7B improved 21.4% on MATH-500 with _random_ rewards, nearly matching the 29.1% gain from ground truth rewards.

The RL update process, even with random rewards, implicitly guides the model's attention. The model isn't learning from the random reward; the training process itself encourages exploring and refining certain internal pathways. In Qwen's case, "code reasoning" (thinking in code without execution) becomes more frequent (65% → 90%). Your performance gain might be an accidental side effect of training, not a result of your carefully designed verifier. [These effects were strongest on Qwen2.5-Math and did not consistently replicate on Llama3 or OLMo2](https://arxiv.org/abs/2506.10947). [Later research](https://arxiv.org/abs/2507.10532) suggests Qwen's unusual sensitivity may indicate training data contamination rather than genuine capability surfacing. On contamination-free datasets, only accurate rewards deliver gains; random rewards provide no benefit. Always validate RLVR gains on held-out, distribution-shifted test sets.

**You can validate your verifier with this test:**

```python
def random_baseline_test(model, dataset, real_verifier):
    # Train with real verifier
    real_results = train_rlvr(model, dataset, real_verifier)

    # Compute reward hit-rate p from real verifier
    real_rewards = [real_verifier(ex.output, ex.answer) for ex in dataset]
    p = sum(real_rewards) / len(real_rewards)

    # Train with random rewards matching base rate
    random_verifier = lambda output, answer: 1.0 if random.random() < p else 0.0
    random_results = train_rlvr(model, dataset, random_verifier)

    if random_results['improvement'] > 0.05:
        print("⚠️ WARNING: Spurious reward sensitivity detected")
        print(f"Test across multiple model families (Llama, OLMo, Qwen)")
        return False
    return True
```

Some "RLVR gains" are artifacts of the training process. Validate on held-out data from different distributions. Test across multiple model families.

### 3. Entropy Instability Destroys Generalization

**Entropy collapse is the silent killer of RLVR generalization.**

[Recent research](https://arxiv.org/abs/2505.22617) shows that as GRPO training progresses and entropy declines, in-distribution test accuracy rises while out-of-distribution performance deteriorates. The model isn't learning generalizable reasoning patterns; it's overfitting to the training distribution. When entropy collapses too early, the policy becomes trapped in narrow reasoning modes that succeed on training data but fail on novel problems.

Value-free methods like GRPO are particularly vulnerable because they use batch statistics as baselines. Using robust baselines like medians instead of means helps prevent instability when reward distributions have outliers.

**Monitor these metrics:**

```python
def check_training_health(training_log):
    for checkpoint in training_log:
        rewards = checkpoint['rewards']
        entropy = checkpoint['entropy']
        kl_div = checkpoint['kl_divergence']

        if np.std(rewards) < 0.1:
            print("⚠️ Reward variance collapsed")
        if entropy < 2.0:  # Domain-specific threshold
            print("⚠️ Entropy too low (mode collapse)")
        if kl_div > 10.0:
            print("⚠️ KL divergence exploding")
```

## How RLVR Works: Training Loop Mechanics

RLVR uses standard RL with deterministic reward functions. Your choice of algorithm determines stability and efficiency.

### Algorithm Choices

**GRPO (Group Relative Policy Optimization):**

- Computes advantages relative to batch statistics
- No value function needed (value-free RL)
- Faster than PPO, simpler implementation
- Used in DeepSeek R1
- Risk: Entropy instability without good baseline

The advantage calculation uses group statistics as the baseline:

```text
A_i = R(s_i, a_i) - baseline(R_group)
```

Where `R(s_i, a_i)` is the verifier's reward (0.0 or 1.0), and the baseline is computed from all samples in the batch (typically mean or median). Outputs with above-average rewards get positive advantages; below-average get negative. The policy gradient then increases probability of high-advantage trajectories.

[Recent analysis](https://arxiv.org/abs/2503.06639) formalizes GRPO's dynamics as a KL-regularized contrastive loss and proves "success amplification": the probability of success after training is guaranteed to exceed the initial probability, regardless of starting point.

**Why value-free RL is popular for RLVR:**
Verifiers provide clean binary signals, eliminating the need for value function approximation. This reduces training complexity and speeds convergence.

### Data Efficiency Tactics

[DEPO](https://arxiv.org/abs/2509.01321) reports comparable performance with only 20% of training data, yielding 1.85× and 1.66× speedups on AIME24/25 for R1-Distill Qwen-7B vs GRPO trained on the full set. Key techniques:

**Offline curation:**

```python
def curate_training_data(dataset, base_model):
    """Select examples where base model struggles but is close"""
    curated = []
    for example in dataset:
        pass_at_k = evaluate_pass_at_k(base_model, example, k=8)
        # Sweet spot: 30-70% pass@k
        if 0.3 <= pass_at_k <= 0.7:
            curated.append(example)
    return curated
```

**Rollout pruning:** Keep top 50% of rollouts by reward
**Difficulty scheduling:** Start easy, gradually increase difficulty

These techniques reduce compute by 60-70% with minimal performance loss.

## Sampler or Thinker? The Core RLVR Debate

<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', alignItems: 'center', margin: '2rem auto'}}>
  <div>
    <img src="/img/blog/rlvr/sampler-vs-thinker.jpg" alt="Sampler vs Thinker Debate" style={{width: '100%', height: 'auto', borderRadius: '8px'}} />
  </div>
  <div>
    <p><a href="https://arxiv.org/abs/2504.13837">Tsinghua research (April 2025)</a> challenges RLVR's effectiveness: "Reasoning LLMs Are Just Efficient Samplers." They found RLVR-trained models generate paths already in the base model's distribution.</p>
    <p>This is the central, most sophisticated question in the field right now: Does RLVR teach models to think differently, or just to search more efficiently?</p>
  </div>
</div>

### The Skeptics: "RLVR is a Sampler, Not a Thinker"

**Evidence:**

- pass@k ceiling stays flat while pass@1 improves
- Models struggle on problems beyond base model's pass@k reach
- Gains correlate with better output selection, not deeper reasoning

**Example:**

```text
Before RLVR:
  pass@1: 40%, pass@8: 75%

After RLVR:
  pass@1: 65% (+25pp), pass@8: 77% (+2pp)

Analysis:
├─ Gap closed: 25pp / 35pp = 71% compression
└─ Ceiling lift: 2pp = minimal capability gain
```

### The Optimists: "RLVR is a Stepping Stone to True Reasoning"

**Evidence from [June 2025 research](https://arxiv.org/abs/2506.14245):**

- CoT-pass@k (requiring correct reasoning path AND answer) shows improvements
- Adaptive guidance with hints expands reachable states
- Some gains persist on unseen problem types

**But:** Separating guidance effects from RLVR effects is difficult.

### What the Data Shows

Recent research suggests most RLVR gains break down as:

- **Majority:** Search compression (pass@k → pass@1 efficiency)
- **Minority:** Capability expansion (pass@k ceiling lift)

The exact ratio varies by model family, verifier coverage, and whether you use guidance techniques. [Tsinghua](https://arxiv.org/abs/2504.13837) and [Scale](https://arxiv.org/abs/2506.13923) both formalize this as "self-distillation" vs "capability gain."

**How to measure what you're getting:**

```python
def analyze_rlvr_gains(base_model, rlvr_model, dataset, k=16):
    base_results = {
        'pass@1': evaluate_pass_at_1(base_model, dataset),
        'pass@k': evaluate_pass_at_k(base_model, dataset, k=k)
    }

    rlvr_results = {
        'pass@1': evaluate_pass_at_1(rlvr_model, dataset),
        'pass@k': evaluate_pass_at_k(rlvr_model, dataset, k=k)
    }

    compression_gain = rlvr_results['pass@1'] - base_results['pass@1']
    capability_gain = rlvr_results['pass@k'] - base_results['pass@k']

    initial_gap = base_results['pass@k'] - base_results['pass@1']
    compression_ratio = compression_gain / initial_gap if initial_gap > 0 else 0

    return {
        'compression_ratio': compression_ratio,
        'capability_gain': capability_gain
    }
```

If compression_ratio > 0.7, you're mostly getting search efficiency, not learning.

## Trading Labels for Logic: Is RLVR Worth the Cost?

> **Note on cost estimates:** The figures below are illustrative order-of-magnitude estimates for planning purposes. Actual costs depend on model size, dataset size, iteration count, cloud provider, and engineering rates. For your specific use case, build a spreadsheet model with: token counts, $/1K tokens, rollout counts (K samples per prompt), number of training steps, verifier execution cost, and engineering hours. Treat these numbers as directional, not precise.

### The Trade-off

You trade generality (RLHF works for any task) for efficiency (RLVR is 3x cheaper on verifiable tasks). Quality differences: RLHF captures nuanced preferences, RLVR provides deterministic correctness.

### When RLVR Makes Economic Sense

**Use RLVR when:**

- Verifier has high coverage (target >90% in adversarial tests)
- Domain is stable (not rapidly changing)
- Engineers understand the domain well
- Correctness > style

**Stick with DPO/RLHF when:**

- Quality is subjective (brand voice, creativity)
- You have high-quality preference data
- Writing verifiers costs as much as labeling
- Errors have severe consequences (medical, legal without human review)

## Practical RLVR: Verifier Design Patterns

Verifier quality determines RLVR effectiveness. These patterns work across domains.

### Math & Code Verifiers (Easy Mode)

#### Pattern: Exact Match + Normalization

```python
# Simplified example - add error handling for production
def math_verifier(output: str, expected_answer: float) -> float:
    """Extract and normalize numerical answers"""
    import re

    # Extract numbers (handles formats like "1,073" or "1073.0")
    numbers = re.findall(r'-?\d+(?:,\d{3})*(?:\.\d+)?', output)

    if not numbers:
        return 0.0

    final_answer = float(numbers[-1].replace(',', ''))
    return 1.0 if abs(final_answer - expected_answer) < 0.01 else 0.0
```

#### Pattern: Unit Test Execution

```python
# CRITICAL: Never use `exec` with untrusted code in production without sandboxing.
# Use Docker containers, gVisor, or hermetic runners with:
# - No network access
# - No file I/O
# - Strict timeouts (e.g., 5s)
# - Resource limits (CPU, memory)

def code_verifier_unsafe_example(generated_code: str, test_cases: list) -> float:
    """THIS IS UNSAFE - for illustration only"""
    try:
        namespace = {}
        exec(generated_code, namespace)  # DANGER: arbitrary code execution

        for test in test_cases:
            exec(test, namespace)

        return 1.0
    except Exception:
        return 0.0

# In production: Use isolated execution environments
# Example: subprocess with timeout, Docker, or cloud functions
```

**What works:** Deterministic checking, fast execution (under 100ms), clear failure modes
**What doesn't:** Style preferences, efficiency requirements, partial credit schemes

### Text2SQL Verifiers (Medium Mode)

#### Pattern: Execution Equivalence

```python
from collections import Counter

def sql_execution_verifier(generated_sql: str, expected_results: list, db) -> float:
    """Execute and compare result sets

    WARNING: Executing model-generated SQL is dangerous.
    - Use read-only database connections
    - Whitelist allowed tables/schemas
    - Set query timeouts
    - Never interpolate model output into queries (SQL injection risk)
    """
    try:
        actual = db.execute(generated_sql).fetchall()

        # Use Counter for multiset equality (handles duplicates and order)
        # Set equality drops duplicates; many benchmarks care about row counts
        actual_multiset = Counter(map(tuple, actual))
        expected_multiset = Counter(map(tuple, expected_results))

        return 1.0 if actual_multiset == expected_multiset else 0.0
    except Exception:
        return 0.0
```

Multiple correct SQL queries can produce the same results. Execution-based verification handles this naturally; you don't need to enumerate all valid queries.

**Databricks case study:**
Their [later paper reports 75.68% BIRD test accuracy](https://arxiv.org/abs/2509.21459) combining execution verifiers with schema validation. Execution checking scales better than query pattern matching.

### Writing Verifiers (Hard Mode)

**Pattern: Rubrics as Rewards ([Scale AI approach](https://scale.com/blog/rubrics-as-rewards))**

````python
def writing_rubric_verifier(output: str, requirements: dict) -> float:
    """Multi-criterion scoring for structured writing"""
    score = 0.0
    for criterion_name, check_fn in requirements.items():
        if check_fn(output):
            score += 1.0 / len(requirements)
    return score

# Example: Technical documentation
requirements = {
    'has_introduction': lambda text: 'introduction' in text.lower()[:300],
    'meets_length': lambda text: 300 <= len(text.split()) <= 500,
    'includes_examples': lambda text: text.lower().count('example') >= 2,
    'has_code_block': lambda text: '```' in text,
}
````

DPO often outperforms rubric-based RLVR on creative tasks where quality is subjective. Rubrics work for structured documents (reports, documentation), not creative writing or marketing copy.

### Verifier Design Principles

**Good verifiers are:**

1. **Fast** (under 100ms per check)
2. **Deterministic** (same input → same output)
3. **High coverage** (>90% of errors caught)
4. **Interpretable** (easy to debug false positives/negatives)
5. **Safe** (no side effects, sandboxed execution)

**Critical security requirements for production verifiers:**

**Code execution verifiers:**

- ⚠️ **NEVER** use `exec()` without sandboxing
- Use Docker containers, gVisor, or Firecracker for isolation
- Hard timeouts (5s max execution time)
- Disable network access entirely
- Resource limits (CPU, memory, disk I/O)

**SQL verifiers:**

- ⚠️ **Read-only** database connections only
- Whitelist allowed tables and schemas
- Query timeouts (2s max)
- No DDL commands (CREATE, DROP, ALTER)
- Never interpolate model output directly (SQL injection risk)

**API-based verifiers:**

- Rate limiting to prevent runaway costs
- Aggressive caching of identical requests
- Cost monitoring and circuit breakers
- Timeout all external calls

**Anti-patterns:**

- Keyword matching (easily gamed)
- Slow verifiers (over 1s per check kills training speed)
- Non-deterministic checks (external API calls)
- Verifiers with side effects (database writes, API charges)

## Testing Your RLVR System

After training, validate two things: (1) Is the model better? (2) Is your verifier reliable?

Verifiers provide training rewards. Evaluation harnesses test if training worked. These are separate pipelines.

### Evaluating Model Quality

```python
def evaluate_pass_at_k(model, test_set, k=8):
    results = {'pass@1': 0, 'pass@k': 0, 'total': len(test_set)}

    for problem in test_set:
        solutions = model.generate(problem, num_samples=k)
        rewards = [verifier(sol, problem.answer) for sol in solutions]

        results['pass@1'] += int(rewards[0] > 0.5)
        results['pass@k'] += int(any(r > 0.5 for r in rewards))

    results['pass@1'] = 100 * results['pass@1'] / results['total']
    results['pass@k'] = 100 * results['pass@k'] / results['total']
    return results
```

**Interpret results:**

| pass@1 | pass@k | Meaning                            |
| ------ | ------ | ---------------------------------- |
| ↑↑     | ↑      | Real capability gain + compression |
| ↑↑     | →      | Pure search compression            |
| ↑      | ↓      | Mode collapse (RED FLAG)           |

### Evaluating Verifier Quality

Build adversarial test suites:

```python
adversarial_cases = [
    {'output': 'The answer is 42', 'expected': 1073,
     'should_pass': False, 'test': 'incorrect_answer'},
    {'output': 'I cannot solve this', 'expected': 1073,
     'should_pass': False, 'test': 'no_answer'},
    {'output': '37 × 29 = 1,073', 'expected': 1073,
     'should_pass': True, 'test': 'correct_with_formatting'},
]

def test_verifier_coverage(verifier, test_cases):
    failures = []
    for case in test_cases:
        result = verifier(case['output'], case['expected'])
        passed = (result > 0.5)
        if passed != case['should_pass']:
            failures.append(case['test'])

    coverage = 1 - (len(failures) / len(test_cases))
    return coverage, failures
```

**Target coverage:** Over 90% (below 70% is exploitable)

### Using Evaluation Harnesses

After training, use tools like [Promptfoo](https://promptfoo.dev) or custom scripts to validate your model. These tools test if training worked; they don't provide training rewards.

## Open Questions

RLVR is promising, but it leaves critical questions unanswered:

**Q1: How do we handle partial verifiers at scale?**
Current: Intent checks, tripwires. Needed: Automated coverage analysis, self-improving verifiers.

**Q2: Do RLVR gains transfer across model families?**
Evidence shows mixed results. Spurious reward sensitivity varies by family. We need cross-family benchmarking standards.

**Q3: What are the scaling laws for RLVR?**
For pretraining, we have Chinchilla laws. For RLVR: unknown. How do gains scale with compute? When do returns diminish?

**Q4: Can we expand beyond deterministic verifiers?**
Current RLVR needs binary correctness. Can we extend to fuzzy verifiers, learned verifiers, or hybrid human-AI verification?

### Emerging Techniques

Research teams are exploring multi-verifier composition (chaining multiple checks with weighted scoring) to address partial verifier coverage. Self-play approaches have models generate harder problems for themselves to sustain exploration during training.

On the tooling front, teams are building verifier template libraries and automated coverage testing frameworks. For high-stakes applications, expect auditing standards and regulatory frameworks as RLVR moves into medical, legal, and financial domains.

## Should You Use RLVR?

### Decision Framework

```text
Do you have objective correctness criteria?
│
├─ YES → Can you write a verifier covering >90% of errors?
│   │
│   ├─ YES → RLVR is worth trying
│   │   └─ Start: Small pilot, compare to DPO
│   │
│   └─ NO → Fix verifier coverage first
│       └─ Build adversarial test suite
│
└─ NO → Stick with DPO/RLHF
    └─ Unless: Task decomposes into verifiable sub-tasks
```

## Conclusion: Don't Mistake Efficiency for Intelligence

Evidence to date suggests that for most applications, RLVR's gains are dominated by search compression rather than expanded reasoning capability. You're optimizing search, not expanding intelligence. The model was already capable of finding the right answer; RLVR just optimizes the path to solutions it could already reach.

If you can write a verifier, you can scale learning. Where ground truth doesn't exist, RLVR fails and human preference data remains superior.

The engineering challenge: proving what you've actually gained. Run pass@k analysis to distinguish compression from capability. Run random baseline tests to check for spurious rewards. Test across multiple model families.

The next time you see a model's performance jump after an RL run, ask the hard question: did you build a better thinker, or did you just build a faster guesser? The answer determines whether your product is truly intelligent or just a fragile house of cards.

---

## Further Reading

**Implementation:**

- [Databricks RLVR on BIRD](https://www.databricks.com/blog/power-rlvr-training-leading-sql-reasoning-model-databricks) - Production Text2SQL case study (73.5% → 75.68% accuracy)
- [OpenRLHF](https://github.com/OpenRLHF/OpenRLHF) - Open-source training framework

**Research:**

- [Reasoning LLMs Are Just Efficient Samplers](https://arxiv.org/abs/2504.13837) (Tsinghua, April 2025) - The sampler vs thinker debate
- [Spurious Rewards in RL Fine-Tuning](https://arxiv.org/abs/2506.10947) (June 2025) - Random signal sensitivity
- [DEPO: Data-Efficient Post-Training](https://arxiv.org/abs/2509.01321) (September 2025) - Compute optimization techniques
