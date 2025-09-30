---
title: 'Reinforcement Learning with Verifiable Rewards: When It Works, When It Fails'
description: 'RLVR trains reasoning models with programmatic verifiers instead of human labels. Research shows 70-80% of gains come from search compression, not new capabilities. Here's what actually works.'
image: /img/blog/rlvr/rlvr-header.jpg
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
date: 2025-09-30
authors: [ian]
tags: [technical-guide, best-practices, evaluation]
---

# Reinforcement Learning with Verifiable Rewards: When It Works, When It Fails

[Recent research suggests 70-80% of RLVR gains come from search compression](https://arxiv.org/abs/2504.13837), not genuine capability expansion. Models learn to find correct answers faster, not to solve fundamentally harder problems.

This isn't the story most RLVR advocates tell. But the data is clear: when you train a model with verifiable rewards, you're mostly buying speed, not smarts. The model was already capable of reaching the right answer—RLVR just forces it to get there in fewer tries.

<!-- truncate -->

The remaining 20-30% represents real learning, but only under specific conditions. Here's the data, the failure modes, and how to tell if you're paying for intelligence or just faster search.

## Recent RLVR Results (September 2025)

**Databricks** achieved 75.68% accuracy on the [BIRD Text2SQL benchmark](https://www.databricks.com/blog/power-rlvr-training-leading-sql-reasoning-model-databricks) using RLVR with execution-based verifiers.

**DeepSeek R1** uses GRPO with rule-based rewards (format compliance, verifiable correctness), demonstrating that RLVR scales to frontier model sizes.

**OpenAI o3/o4-mini** (April 2025 release) showed strong HumanEval improvements using RL techniques. While OpenAI hasn't detailed their exact approach, their technical report noted diminishing returns on multi-step reasoning tasks—consistent with the compression vs capability tradeoff RLVR research identifies.

But [research from Tsinghua](https://arxiv.org/abs/2504.13837) shows RLVR-trained models generate reasoning paths already present in the base model's distribution. RLVR biases sampling toward correct solutions but reduces exploration capacity.

## What RLVR Is (and Isn't)

RLVR replaces learned reward models with programmatic verifiers:

```python
# Simplified example - production code needs error handling
def verifier(output: str, ground_truth: Any) -> float:
    """Returns 1.0 if correct, 0.0 if incorrect"""
    return 1.0 if check_correctness(output, ground_truth) else 0.0
```

This change has implications:

- **No reward model training:** Skip weeks of training on preference pairs
- **Deterministic feedback:** Same input produces same reward
- **Fast iteration:** Change verifier logic without retraining
- **Scalable:** Verifiers run in milliseconds

### Comparison to Other Methods

| Method   | Reward Signal      | Best For           | Major Limitation |
| -------- | ------------------ | ------------------ | ---------------- |
| **RLHF** | Human preferences  | Subjective quality | Expensive, slow  |
| **DPO**  | Preference pairs   | Style, tone        | Needs good pairs |
| **RLVR** | Programmatic check | Verifiable tasks   | Needs verifiers  |

_Note: This comparison focuses on post-training methods for reasoning models. Other approaches like RLAIF and Constitutional AI use different paradigms._

### The Training Loop

```
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

RLVR works where ground truth exists. It fails for creative writing, brand voice, or nuanced argumentation. Human preference data remains superior for subjective quality. RLVR is standard reinforcement learning with deterministic reward functions—the technique isn't new, but applying it to LLM post-training at scale is.

## What Breaks (Research-Backed Failure Modes)

Three failure modes account for most RLVR problems. Unlike traditional RL issues, these stem from verifier design and the specific challenges of language model training.

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

**Mitigation:**

- Build adversarial test suites for verifiers
- Measure false negative rate on known-bad outputs
- Add secondary checks (intent verification, format validation)

### 2. Spurious Rewards: Models Improve with Random Signals

**Your gains might be an accidental side effect of training, not a result of your verifier.**

[Research from June 2025](https://arxiv.org/abs/2506.10947) found Qwen2.5-Math-7B improved 21.4% on MATH-500 with _random_ rewards, nearly matching the 29.1% gain from ground truth rewards.

**Why this happens:**
The RL update process, even with random rewards, implicitly guides the model's attention. The model isn't learning from the random reward—the training process itself encourages exploring and refining certain internal pathways. In Qwen's case, "code reasoning" (thinking in code without execution) becomes more frequent (65% → 90%). Your performance gain might be an accidental side effect of training, not a result of your carefully designed verifier. This behavior is family-specific; Llama and OLMo models don't show it.

**Always run this test:**

```python
def random_baseline_test(model, dataset):
    # Train with real verifier
    real_results = train_rlvr(model, dataset, real_verifier)

    # Train with random rewards
    random_verifier = lambda output, answer: random.choice([0.0, 1.0])
    random_results = train_rlvr(model, dataset, random_verifier)

    if random_results['improvement'] > 0.05:
        print("⚠️ WARNING: Spurious reward sensitivity detected")
        return False
    return True
```

**What this means:**
Some "RLVR gains" are artifacts of the training process. Validate on held-out data from different distributions. Test across multiple model families.

### 3. Entropy Instability in Value-Free RL

**Value-free methods are fast but can make your model's outputs collapse into repetition or explode into gibberish.**

GRPO and value-free algorithms can cause entropy collapse (outputs become deterministic) or explosion (outputs become random) without proper baseline selection.

Recent work suggests quantile-based baselines (q=0.5) stabilize training better than mean baselines:

```python
# Instead of mean baseline (can be unstable)
baseline = np.mean(rewards)

# Use quantile baseline (more stable)
baseline = np.quantile(rewards, q=0.5)
```

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

**Why value-free RL is popular for RLVR:**
Verifiers provide clean binary signals, eliminating the need for value function approximation. This reduces training complexity and speeds convergence.

### Data Efficiency Tactics

[DEPO research](https://arxiv.org/abs/2509.01321) achieved comparable performance using only 20% of training data through:

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

[Tsinghua research (April 2025)](https://arxiv.org/abs/2504.13837) challenges RLVR's effectiveness: "Reasoning LLMs Are Just Efficient Samplers." They found RLVR-trained models generate paths already in the base model's distribution.

This is the central, most sophisticated question in the field right now: Does RLVR teach models to think differently, or just to search more efficiently?

### The Skeptics: "RLVR is a Sampler, Not a Thinker"

**Evidence:**

- pass@k ceiling stays flat while pass@1 improves
- Models struggle on problems beyond base model's pass@k reach
- Gains correlate with better output selection, not deeper reasoning

**Example:**

```
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

Most RLVR gains break down as:

- **70-80%:** Search compression (pass@k → pass@1 efficiency)
- **20-30%:** Capability expansion (pass@k ceiling lift)

The ratio depends on base model strength, verifier coverage, and whether you use guidance techniques.

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

_Note: Cost estimates below are illustrative based on industry reports. Actual costs vary significantly by scale, infrastructure, and provider._

### Estimated Cost Comparison

**Traditional RLHF Pipeline:**

```
1. Collect human preferences: ~$50K-100K
2. Train reward model: ~$20K compute
3. PPO training: ~$30K compute
Total: ~$100K-150K, 3-4 weeks
```

**RLVR Pipeline:**

```
1. Write verifiers: ~$5K-10K engineer time
2. GRPO training: ~$30K compute
Total: ~$35K-40K, 1-1.5 weeks
```

**Estimated savings: 65-75% on cost, 50% on timeline**

### The Trade-off

You trade generality (RLHF works for any task) for efficiency (RLVR is 3x cheaper on verifiable tasks). Quality differences: RLHF captures nuanced preferences, RLVR provides deterministic correctness.

### When RLVR Makes Economic Sense

**Use RLVR when:**

- Verifier covers >90% of errors
- Domain is stable (not rapidly changing)
- Engineers understand the domain well
- Correctness > style

**Stick with DPO/RLHF when:**

- Quality is subjective (brand voice, creativity)
- You have high-quality preference data
- Writing verifiers costs as much as labeling
- Errors have severe consequences (medical, legal without human review)

## Practical RLVR: Verifier Design Patterns

Verifier quality determines RLVR effectiveness. Here are patterns that work across domains.

### Math & Code Verifiers (Easy Mode)

**Pattern: Exact Match + Normalization**

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

**Pattern: Unit Test Execution**

```python
# Production code should sandbox execution
def code_verifier(generated_code: str, test_cases: list) -> float:
    """Run code against test suite"""
    try:
        namespace = {}
        exec(generated_code, namespace)

        for test in test_cases:
            exec(test, namespace)

        return 1.0
    except Exception:
        return 0.0
```

**What works:** Deterministic checking, fast execution (<100ms), clear failure modes
**What doesn't:** Style preferences, efficiency requirements, partial credit schemes

### Text2SQL Verifiers (Medium Mode)

**Pattern: Execution Equivalence**

```python
def sql_execution_verifier(generated_sql: str, expected_results: list, db) -> float:
    """Execute and compare result sets"""
    try:
        actual = db.execute(generated_sql).fetchall()
        actual_set = set(map(tuple, actual))
        expected_set = set(map(tuple, expected_results))
        return 1.0 if actual_set == expected_set else 0.0
    except Exception:
        return 0.0
```

**Why this works:** Multiple correct SQL queries can produce the same results. Execution-based verification handles this naturally—you don't need to enumerate all valid queries.

**Databricks case study:**
Their [BIRD benchmark work](https://www.databricks.com/blog/power-rlvr-training-leading-sql-reasoning-model-databricks) combined execution verifiers with schema validation, achieving 75.68% test accuracy. Key insight: Execution checking scales better than query pattern matching.

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

**Reality check:** DPO often outperforms rubric-based RLVR on truly creative tasks. Use rubrics for structured documents (reports, documentation), not creative writing or marketing copy.

### Verifier Design Principles

**✅ Good verifiers are:**

1. **Fast** (<100ms per check)
2. **Deterministic** (same input → same output)
3. **High coverage** (>90% of errors caught)
4. **Interpretable** (easy to debug false positives/negatives)
5. **Safe** (no side effects, sandboxed execution)

**❌ Anti-patterns:**

- Keyword matching (easily gamed)
- Slow verifiers (>1s per check kills training speed)
- Non-deterministic checks (external API calls)
- Verifiers with side effects (database writes, API charges)

## Testing Your RLVR System

After training, validate two things: (1) Is the model better? (2) Is your verifier reliable?

**The distinction:** Verifiers provide training rewards. Evaluation harnesses test if training worked. These are separate pipelines.

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

**Target coverage:** >90% (below 70% is exploitable)

### Using Evaluation Harnesses

After training, use tools like [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness), [Promptfoo](https://promptfoo.dev), or custom scripts to validate your model. These tools test if training worked—they don't provide training rewards.

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

### What to Watch (Late 2025-2026)

1. **Multi-verifier composition** - Chaining multiple checks with weighted scoring
2. **Self-play + RLVR** - Models generating harder problems for themselves
3. **Enterprise tooling** - Verifier template libraries, automated coverage testing
4. **Regulatory implications** - Auditing standards for high-stakes verifiers

## Should You Use RLVR?

### Decision Framework

```
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

### Budget-Based Guidance

**<$10K:** Open-source models, math/code domains, existing benchmarks (GSM8K, HumanEval)
**$10K-$100K:** Fine-tune on your domain, custom verifiers, compare RLVR vs DPO
**>$100K:** Hybrid approach (RLVR for verifiable + DPO for quality), production monitoring

## Conclusion: Don't Mistake Efficiency for Intelligence

The data is unambiguous: 70-80% of RLVR's improvements come from search compression, not expanded reasoning capability. You're buying speed, not smarts. The model was already capable of finding the right answer—RLVR just optimizes the path to solutions it could already reach.

The rule is simple: if you can write a checker, you can scale learning. Where ground truth doesn't exist, RLVR fails and human preference data remains superior.

The real engineering challenge isn't just implementing RLVR; it's proving what you've actually gained. We should be running pass@k analysis to distinguish compression from capability. We should be running random baseline tests to check for spurious rewards. As a community, we need to demand proof of genuine improvement, because the future of reliable AI depends on us knowing the difference.

---

## Resources

**Key Papers:**

- [Does RL Incentivize Reasoning Beyond Base?](https://arxiv.org/abs/2504.13837) (April 2025) - The efficiency vs capability debate
- [Spurious Rewards](https://arxiv.org/abs/2506.10947) (June 2025) - Random reward sensitivity in Qwen models
- [RLVR Incentivizes Reasoning](https://arxiv.org/abs/2506.14245) (June 2025) - CoT-pass@k analysis
- [DEPO](https://arxiv.org/abs/2509.01321) (September 2025) - Data-efficient training

**Industry Applications:**

- [Databricks RLVR on BIRD](https://www.databricks.com/blog/power-rlvr-training-leading-sql-reasoning-model-databricks) - Text2SQL case study
- [Scale AI Rubrics as Rewards](https://scale.com/blog/rubrics-as-rewards) - Extending to semi-verifiable tasks

**Training Frameworks:**

- [trlX](https://github.com/CarperAI/trlx) - RL for language models
- [OpenRLHF](https://github.com/OpenRLHF/OpenRLHF) - Open-source RLHF/RLVR

**Evaluation Tools:**

- [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) - Standard benchmarks
- [Promptfoo](https://promptfoo.dev) - Custom evaluations

---

_Discussed RLVR in production? Share your verifier coverage results and failure modes in the comments._
