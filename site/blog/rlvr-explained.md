---
title: 'RLVR Explained: How Verifiers Replace Labels in Modern AI Training'
description: 'RLVR trains reasoning models with programmatic verifiers instead of human labels. Learn what works, what breaks, and how to build reliable verification systems.'
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
    DAPO,
    verifier design,
    model evaluation,
  ]
date: 2025-09-29
authors: [author-name]
tags: [technical-guide, best-practices, evaluation]
---

# RLVR Explained: How Verifiers Replace Labels in Modern AI Training

Training a reasoning model traditionally requires thousands of human-labeled examples and weeks of reward model training—unless you can write a function to check if the answer is correct.

Reinforcement Learning with Verifiable Rewards (RLVR) replaces learned reward models with programmatic verifiers. Instead of training on human preferences, you write a function that returns `true` for correct outputs and `false` for incorrect ones. Execute the code, check the math, run the SQL query—if your verifier is deterministic and high-coverage, RLVR can dramatically accelerate learning.

<!-- truncate -->

Recent results show RLVR delivering significant improvements on verifiable tasks:

- **Databricks** achieved top single-model performance on the BIRD Text2SQL benchmark using RLVR
- **Research** shows +20-30pp improvements in pass@1 accuracy on math reasoning tasks
- **Cost reduction** of 65-70% compared to RLHF on tasks with clear correctness criteria

But RLVR isn't magic. It works where ground truth exists and fails where quality is subjective. This post explains how RLVR works, when to use it, and how to avoid common pitfalls.

:::tip Quick Reference

**What RLVR Is:**
Training with programmatic correctness checks instead of learned reward models

**Best For:**
Math, code, SQL, structured tasks with objective correctness criteria

**Not For:**
Creative writing, brand voice, subjective quality, nuanced argumentation

**Key Challenge:**
Building verifiers that catch >90% of errors without false positives

:::

## What RLVR Is (and Isn't)

RLVR replaces learned reward models with programmatic verifiers. Instead of training a neural network to predict human preferences, you write a function:

```python
def verifier(output: str, ground_truth: Any) -> float:
    """
    Returns 1.0 if output is correct, 0.0 if incorrect
    """
    return 1.0 if check_correctness(output, ground_truth) else 0.0
```

This simple change has profound implications:

- **No reward model training:** Save weeks of training and thousands of labeled preference pairs
- **Deterministic feedback:** Same input always produces same reward
- **Fast iteration:** Change verifier logic without retraining models
- **Scalable:** Verifiers run in milliseconds, not seconds

### How RLVR Differs from Other Methods

| Method | Reward Signal | Cost per 1K Samples | Best For | Major Limitation |
|--------|--------------|---------------------|----------|------------------|
| **RLHF** | Human preferences | $500-2000 | Subjective quality | Expensive, slow |
| **DPO** | Preference pairs | $100-500 | Style, tone | Needs good pairs |
| **RLVR** | Programmatic check | $10-50 | Verifiable tasks | Needs verifiers |
| **RaR** | Rubric scoring | $50-200 | Semi-verifiable | Rubric quality |

*Note: Costs are illustrative and vary significantly by scale, provider, and domain*

### The Training Loop

Here's how RLVR works in practice:

```
1. Generate K candidate solutions for each prompt
   Input: "What is 37 × 29?"
   Outputs: [1073, 1072, 1073, 1074, 1073, 1071, 1073, 1073]

2. Verify each output
   Rewards: [1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 1.0]

3. Update policy to favor high-reward trajectories
   (Using GRPO, DAPO, or similar algorithm)

4. Repeat with new prompts
```

The key insight: if 5 out of 8 attempts succeed, the model learns which reasoning paths led to correct answers.

### What RLVR Is NOT

**Not a replacement for DPO on subjective tasks.** If quality depends on style, tone, or creativity, human preference data remains superior. RLVR excels where correctness is checkable—mathematical accuracy, code execution, SQL correctness.

**Not a silver bullet.** RLVR's effectiveness depends entirely on verifier quality. A weak verifier (catching only 60% of errors) creates exploitable gaps. Models will find and exploit these gaps.

**Not new conceptually.** RLVR is standard reinforcement learning where rewards come from deterministic functions rather than learned models. What's new is applying this at scale to language model post-training.

## What Breaks (and Why You Should Care)

Before explaining how to use RLVR effectively, let's examine what goes wrong. Three failure modes account for most RLVR problems in practice.

### 1. Partial Verifiers: The 60% Coverage Problem

**The Problem:**
Your verifier catches 60% of errors. The model finds the 40% gap and exploits it.

**Real Example: SQL Generation**

```python
# Weak verifier: Only checks syntax
def weak_sql_verifier(sql_query):
    try:
        parse(sql_query)  # Just check if it parses
        return 1.0
    except:
        return 0.0

# What happens:
# Model learns to generate syntactically valid but semantically wrong queries
# "SELECT * FROM users WHERE 1=1"  -> Gets reward: 1.0
# Even though it doesn't answer the question!
```

**Strong verifier: Execution-based checking**

```python
def strong_sql_verifier(sql_query, expected_results, db_connection):
    try:
        actual_results = db_connection.execute(sql_query).fetchall()
        expected_set = set(map(tuple, expected_results))
        actual_set = set(map(tuple, actual_results))
        return 1.0 if actual_set == expected_set else 0.0
    except:
        return 0.0  # Syntax errors or execution failures
```

**Mitigation Strategies:**

- **Intent checks:** Add secondary verifiers that check if the solution addresses the prompt
- **Adversarial testing:** Build test suites of known-bad outputs your verifier should catch
- **Coverage analysis:** Measure what % of error types your verifier detects

Research on IFDECORATOR shows that wrapping verifiers with adversarial data flywheels and tripwires significantly reduces reward hacking.

### 2. Spurious Rewards: The Random Baseline Problem

**The Problem:**
Some model families improve even with random rewards.

**Evidence:**
Research on [spurious rewards](https://arxiv.org/abs/2506.10947) found that certain Qwen variants showed significant gains when trained with random or incorrect reward signals. This indicates model-family-specific sensitivities to reward distribution rather than genuine learning.

**Always Run This Test:**

```python
def spurious_reward_test(model, dataset):
    """
    Train with random rewards - should see ZERO improvement
    """
    # Real training
    real_results = train_rlvr(model, dataset, real_verifier)

    # Random rewards
    random_verifier = lambda output, answer: random.choice([0.0, 1.0])
    random_results = train_rlvr(model, dataset, random_verifier)

    if random_results['improvement'] > 0.05:
        print("⚠️ WARNING: Model improving with random rewards")
        print("Indicates memorization or distribution shift, not learning")
        return False

    return True
```

**What This Means:**

- Some gains may be artifacts of the training process, not genuine learning
- Always validate on held-out data from different distributions
- Test across multiple model families before claiming success

### 3. Entropy Instability: The Collapse Problem

**The Problem:**
Value-free RL algorithms (GRPO, DAPO) can cause entropy collapse or explosion without proper baseline selection.

**Symptoms:**

- **Entropy collapse:** Model outputs become deterministic, loses diversity
- **Entropy explosion:** Model outputs become random, loses coherence
- **Mode collapse:** Model finds one solution and repeats it

**Solution: Quantile Advantage Estimation (QAE)**

Recent work on [QAE](https://arxiv.org/abs/2509.22611) shows that using quantile-based baselines (typically q=0.5) stabilizes training:

```python
# Instead of mean baseline
baseline = np.mean(rewards)  # Can be unstable

# Use quantile baseline
baseline = np.quantile(rewards, q=0.5)  # More stable
```

**What to Monitor:**

```python
def check_training_health(training_log):
    """
    Red flags in RLVR training
    """
    for checkpoint in training_log:
        rewards = checkpoint['rewards']
        entropy = checkpoint['entropy']
        kl_div = checkpoint['kl_divergence']

        # Red flags
        if np.std(rewards) < 0.1:
            print("⚠️ Reward variance collapsed")

        if entropy < 2.0:  # Domain-specific threshold
            print("⚠️ Entropy too low (mode collapse)")

        if kl_div > 10.0:  # Too far from base model
            print("⚠️ KL divergence exploding")
```

:::warning Red Flags in Your RLVR Training

Watch for these warning signs:

- **Verifier coverage < 90%:** Models will exploit gaps (reward gaming)
- **Entropy drops > 50%:** Policy collapse, loss of diversity
- **Pass@1 up, pass@8 flat:** Pure compression, no true learning
- **Random baseline improves:** Spurious correlations, not genuine learning
- **Works on Model A, fails on Model B:** Family-specific quirks

:::

## How RLVR Works: From Verifiers to Policy Updates

Understanding the RLVR training loop reveals why it works for some tasks and fails for others.

### The Training Loop Visualized

```
┌─────────────────────────────────────────────┐
│  User Prompt: "Solve 37 × 29"              │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  Model Generates K=8 Rollouts:             │
│  1. "37×29 = 1073" ✓                       │
│  2. "Let me compute... 1072" ✗             │
│  3. "The answer is 1073" ✓                 │
│  4. "37*29 = 1074" ✗                       │
│  5. "Calculating: 1073" ✓                  │
│  6. "The product is 1071" ✗                │
│  7. "37 × 29 equals 1073" ✓                │
│  8. "Result: 1073" ✓                       │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  Verifier Checks Each Output:              │
│  Rewards: [1.0, 0.0, 1.0, 0.0,             │
│            1.0, 0.0, 1.0, 1.0]             │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│  Policy Update (KL-Regularized):           │
│  • Upweight trajectories → 1073            │
│  • Downweight trajectories → wrong answers │
│  • Maintain KL < threshold to base model   │
└─────────────────────────────────────────────┘
```

### Algorithm Choices: GRPO vs DAPO vs PPO

Modern RLVR implementations typically use **value-free** reinforcement learning algorithms:

**GRPO (Group Relative Policy Optimization):**
- Computes advantages relative to batch statistics
- No value function needed
- Faster, simpler than PPO
- Risk: Entropy instability without good baseline

**DAPO (Direct Advantage Policy Optimization):**
- Similar to GRPO but with different advantage estimation
- Often more stable on small batches
- Popular in recent research

**PPO (Proximal Policy Optimization):**
- Traditional choice, requires value function
- More stable but slower and more complex
- Falling out of favor for RLVR

**Why value-free RL is popular for RLVR:**

1. Verifiers provide clean binary signals (don't need value function approximation)
2. Faster training (fewer networks to update)
3. Simpler implementation (easier to debug)

### Data Efficiency Tactics

RLVR can be data-hungry. Techniques from [DEPO (Data-Efficient Policy Optimization)](https://arxiv.org/abs/2509.01321) help:

**1. Offline Curation:**
```python
# Don't train on all data - curate high-quality subset
def curate_training_data(dataset, base_model):
    """
    Select examples where base model struggles but is close
    """
    curated = []
    for example in dataset:
        pass_at_k = evaluate_pass_at_k(base_model, example, k=8)

        # Sweet spot: 30-70% pass@8
        if 0.3 <= pass_at_k <= 0.7:
            curated.append(example)

    return curated
```

**2. Rollout Pruning:**
```python
# Don't keep all rollouts - prune low-quality ones
def prune_rollouts(rollouts, rewards, keep_ratio=0.5):
    """
    Keep top 50% of rollouts by reward
    """
    indices = np.argsort(rewards)[-int(len(rewards) * keep_ratio):]
    return [rollouts[i] for i in indices]
```

**3. Difficulty Scheduling:**
```python
# Start easy, gradually increase difficulty
def schedule_difficulty(epoch, dataset):
    """
    Curriculum learning for RLVR
    """
    if epoch < 5:
        return dataset.filter(difficulty='easy')
    elif epoch < 10:
        return dataset.filter(difficulty='medium')
    else:
        return dataset  # All difficulties
```

These techniques can reduce data requirements by 70-80% while maintaining performance.

## The Efficiency vs Capability Debate

The central question in RLVR research: **Does it make models smarter, or just faster at searching?**

This is not just academic—it determines whether RLVR is truly scaling intelligence or merely optimizing search efficiency.

### Camp 1: "RLVR Only Compresses Search"

**The Argument:**
RLVR improves pass@1 by converting pass@K search into better sampling. The model isn't solving harder problems—it's just finding the right answer in fewer tries.

**Evidence:**

From ["Does RL Really Incentivize Reasoning Capacity?"](https://arxiv.org/abs/2504.13837):
- Pass@K ceiling remains flat while pass@1 improves
- Models struggle on problems beyond base model's pass@K reach
- Improvements correlate with better output selection, not deeper reasoning

**Example:**

```
Before RLVR:
  pass@1: 40%  (first try success)
  pass@8: 75%  (success in 8 tries)

After RLVR:
  pass@1: 65%  (+25pp)
  pass@8: 77%  (+2pp)

Interpretation:
├─ Gap closed: 25pp / 35pp = 71% compression
└─ Ceiling lift: 2pp = 3% capability gain
```

**Implication:**
RLVR is valuable for deployment efficiency (fewer tokens, lower latency) but doesn't fundamentally expand model capabilities.

### Camp 2: "RLVR Enables Real Learning"

**The Argument:**
RLVR improves reasoning quality, not just output selection. Models learn better reasoning paths and genuinely solve harder problems.

**Evidence:**

From ["RLVR Implicitly Incentivizes Correct Reasoning"](https://arxiv.org/abs/2506.14245):
- CoT-pass@K analysis shows improved reasoning steps, not just final answers
- Models generate novel solutions not seen in pass@K from base model
- Adaptive guidance research shows expanded reachable states

**Example: Adaptive Guidance**

From [Scale AI's research](https://arxiv.org/abs/2506.13923):

```python
# Guidance expands capability beyond base model's pass@K
def adaptive_guidance(model, problem, difficulty):
    """
    Provide hints when model is stuck
    """
    attempt = model.generate(problem)

    if verifier(attempt) == 0.0:  # Failed
        hint = generate_hint(problem, difficulty)
        guided_attempt = model.generate(f"{problem}\n\nHint: {hint}")
        return guided_attempt

    return attempt
```

With adaptive guidance + RLVR:
- pass@K ceiling increases (not just compression)
- Models solve problems previously unreachable
- But: hard to separate guidance effect from RLVR effect

**Implication:**
RLVR can expand capabilities when combined with techniques that push models beyond base limitations.

### What the Data Actually Shows

**Our take: Both are true, in different proportions.**

Most RLVR gains break down as:
- **70-80%:** Search compression (pass@K → pass@1 efficiency)
- **20-30%:** Capability expansion (pass@K ceiling lift)

The ratio depends on:

1. **Base model strength:** Stronger base = more compression, less capability gain
2. **Verifier coverage:** High coverage enables genuine learning
3. **Guidance techniques:** Hints and adaptive methods increase capability gains
4. **Problem difficulty:** Harder problems show more capability expansion

### How to Measure What You're Getting

```python
def analyze_rlvr_gains(base_model, rlvr_model, dataset, k=16):
    """
    Separate compression from capability gains
    """
    base_results = {
        'pass@1': evaluate_pass_at_1(base_model, dataset),
        'pass@k': evaluate_pass_at_k(base_model, dataset, k=k)
    }

    rlvr_results = {
        'pass@1': evaluate_pass_at_1(rlvr_model, dataset),
        'pass@k': evaluate_pass_at_k(rlvr_model, dataset, k=k)
    }

    # Calculate components
    compression_gain = rlvr_results['pass@1'] - base_results['pass@1']
    capability_gain = rlvr_results['pass@k'] - base_results['pass@k']

    initial_gap = base_results['pass@k'] - base_results['pass@1']
    compression_ratio = compression_gain / initial_gap if initial_gap > 0 else 0

    return {
        'compression_gain': compression_gain,
        'capability_gain': capability_gain,
        'compression_ratio': compression_ratio,
        'total_gain': compression_gain + capability_gain
    }
```

**Interpretation Guide:**

```
If compression_ratio > 0.7:
  └─ "Mostly search efficiency gains"

If capability_gain > 5pp AND compression_ratio < 0.5:
  └─ "Significant true learning"

If compression_ratio > 0.9 AND capability_gain < 2pp:
  └─ "Pure compression, minimal learning"
```

:::tip Measuring Your RLVR System

Always track:
1. **pass@1:** What matters for deployment
2. **pass@K:** Where K=8 or K=16 (reveals ceiling)
3. **Compression ratio:** How much gap you closed
4. **Capability gain:** How much ceiling moved

If pass@K is flat but pass@1 improves → pure compression
If pass@K rises → capability gain (the valuable part)

:::

## From Labels to Verifiers: The Economics

RLVR's business case is straightforward: if you can encode domain expertise as verifiers, you can replace weeks of labeling with days of engineering.

### Cost Breakdown: RLHF vs RLVR

**Traditional RLHF Pipeline:**
```
1. Collect human preferences
   └─ $50K-100K (10-20K comparisons @ $5-10 each)

2. Train reward model
   └─ $20K compute (3-5 days on GPU cluster)

3. PPO training with reward model
   └─ $30K compute (5-7 days)

Total: ~$100K-150K
Timeline: 3-4 weeks
```

**RLVR Pipeline:**
```
1. Write verifiers
   └─ $5K-10K engineer time (2-3 days)

2. GRPO/DAPO training with verifiers
   └─ $30K compute (5-7 days, same as RLHF)

Total: ~$35K-40K
Timeline: 1-1.5 weeks
```

**Savings: 65-75% on total cost, 50% on timeline**

### The Trade-Off

**You're Trading:**

❌ **Generality** (RLHF works for any task)
✅ **Efficiency** (RLVR is 3x cheaper on verifiable tasks)

❌ **Subjective quality** (RLHF captures nuanced preferences)
✅ **Objective correctness** (RLVR catches errors deterministically)

❌ **Flexibility** (RLHF adapts to changing preferences)
✅ **Speed** (RLVR verifiers run in milliseconds)

### When the Math Works

**RLVR makes economic sense when:**

```
✅ Verifier covers >90% of errors
✅ Domain is stable (not rapidly changing)
✅ You have engineers who know the domain
✅ You can tolerate 2-5% error rate from verification gaps
✅ Correctness is more important than style
```

**Stick with DPO/RLHF when:**

```
❌ Quality is subjective (brand voice, creativity)
❌ You already have high-quality preference data
❌ Writing verifiers is as expensive as labeling
❌ Domain changes rapidly (news, current events)
❌ Errors have severe consequences (medical, legal)
```

### Cost Comparison Across Methods

<div style={{textAlign: 'center'}}>

| Dimension | RLHF | DPO | RLVR |
|-----------|------|-----|------|
| **Initial Setup** | High ($50K+) | Medium ($20K) | Low ($5K) |
| **Compute Cost** | High | Medium | Medium |
| **Iteration Speed** | Slow (weeks) | Medium (days) | Fast (hours) |
| **Best Domain** | Subjective | Style/Tone | Correctness |
| **Scalability** | Limited by humans | Limited by pairs | Limited by compute |
| **Error Handling** | Soft (preferences) | Soft (preferences) | Hard (binary) |

</div>

**The emerging pattern:**
Leading teams use hybrid approaches—RLVR for verifiable components (math, code, structure) + DPO for subjective quality (tone, style, presentation).

## The Bitter Lesson Connection

> "The biggest lesson that can be read from 70 years of AI research is that general methods that leverage computation are ultimately the most effective, by a large margin."
> — Rich Sutton, ["The Bitter Lesson"](http://www.incompleteideas.net/IncIdeas/BitterLesson.html) (2019)

RLVR exemplifies Sutton's historical observation. Throughout AI history, we've repeatedly seen:

**The Pattern:**
```
1960s-70s: Hand-crafted chess heuristics → Deep search + simple eval
1980s-90s: Expert systems → Statistical learning
2000s-10s: Feature engineering → Deep learning
2020s: Hand-labeled preferences → Verifiers + compute
```

Each transition follows the same arc:
1. Domain experts encode knowledge manually
2. General methods + more compute outperform expert encoding
3. Research community learns the lesson (again)
4. Next domain repeats the cycle

### Why This Matters for RLVR

**For ML Practitioners:**
Stop over-indexing on labeling quality. A simple verifier + more compute often beats perfectly curated preference data.

**For Engineering Leaders:**
Invest in verifier infrastructure, not larger labeling teams. The ROI on verifier engineering is 10x labeling operations for verifiable domains.

**For Researchers:**
Study general learning mechanisms that leverage verification, not task-specific reward model architectures.

### The Counter-Argument: When Bitter Lesson Doesn't Apply

**Not all tasks reduce to verification.** Some domains genuinely need nuanced human judgment:

- **Creative writing:** Quality isn't binary
- **Brand voice:** Consistency requires subtle preference modeling
- **Political/ethical reasoning:** "Correctness" is culturally dependent
- **Aesthetic judgment:** Beauty isn't verifiable

**RLVR works where ground truth exists.** Don't force it where it doesn't.

The lesson: **Choose the right tool.** RLVR for verifiable domains, RLHF/DPO for subjective quality, and hybrid approaches for complex applications.

## Practical RLVR: Verifier Design Patterns

The quality of your RLVR system depends entirely on your verifiers. Here are the patterns that work across different domains.

### Domain 1: Math & Code (Easy Mode)

**Pattern: Exact Match + Normalization**

```python
def math_verifier(output: str, expected_answer: float) -> float:
    """
    Extract and normalize numerical answers
    Handles various formats: "1073", "1,073", "1073.0"
    """
    import re

    # Extract numbers from output
    # Look for the last number mentioned (typical pattern)
    numbers = re.findall(r'-?\d+(?:,\d{3})*(?:\.\d+)?', output)

    if not numbers:
        return 0.0

    # Clean and convert
    final_answer = numbers[-1].replace(',', '')
    final_answer = float(final_answer)

    # Allow small floating point tolerance
    return 1.0 if abs(final_answer - expected_answer) < 0.01 else 0.0
```

**Pattern: Unit Test Execution**

```python
def code_verifier(generated_code: str, test_cases: list) -> float:
    """
    Run generated code against test suite in isolated environment
    """
    import sys
    from io import StringIO

    try:
        # Create isolated namespace
        namespace = {}

        # Execute code
        exec(generated_code, namespace)

        # Run all test cases
        for test in test_cases:
            exec(test, namespace)

        return 1.0  # All tests passed

    except Exception as e:
        return 0.0  # Any failure = 0 reward
```

**What Works:**
- ✅ Deterministic checking (same input → same output)
- ✅ Fast execution (< 100ms per check)
- ✅ Clear failure modes (syntax vs logic errors)

**What Doesn't:**
- ❌ Style preferences (naming, formatting)
- ❌ Efficiency requirements (time/space complexity)
- ❌ Partial credit (all-or-nothing is cleaner for RLVR)

**Example Use Case:**

```python
# GSM8K-style math problem
problem = "Sarah has 3 boxes of pencils. Each box contains 12 pencils. She gives away 8 pencils. How many pencils does she have left?"
expected_answer = 28.0

# Model output
output = "Let me calculate:\n3 boxes × 12 pencils = 36 pencils\n36 - 8 = 28 pencils\nSarah has 28 pencils left."

reward = math_verifier(output, expected_answer)  # Returns 1.0
```

### Domain 2: Text2SQL (Medium Mode)

**Pattern: Execution Equivalence**

```python
def sql_execution_verifier(
    generated_sql: str,
    expected_results: list,
    db_connection
) -> float:
    """
    Execute SQL and compare result sets
    Handles multiple correct queries that produce same output
    """
    try:
        # Execute generated query
        cursor = db_connection.execute(generated_sql)
        actual_results = cursor.fetchall()

        # Convert to sets (order-agnostic comparison)
        actual_set = set(map(tuple, actual_results))
        expected_set = set(map(tuple, expected_results))

        # Exact match required
        return 1.0 if actual_set == expected_set else 0.0

    except Exception as e:
        # Syntax errors, invalid queries, permission issues
        return 0.0
```

**Pattern: Schema Validation (Partial Credit)**

```python
def sql_schema_verifier(
    generated_sql: str,
    required_tables: list,
    required_columns: list
) -> float:
    """
    Verify SQL references correct schema elements
    Useful as secondary signal alongside execution verification
    """
    sql_upper = generated_sql.upper()

    score = 0.0

    # Check table usage (50% of score)
    tables_found = sum(1 for table in required_tables
                       if table.upper() in sql_upper)
    score += 0.5 * (tables_found / len(required_tables))

    # Check column usage (50% of score)
    columns_found = sum(1 for col in required_columns
                        if col.upper() in sql_upper)
    score += 0.5 * (columns_found / len(required_columns))

    return score
```

**Real-World Consideration:**

Multiple correct SQL queries can produce the same results. Execution-based verification handles this naturally—you don't need to enumerate all valid queries.

**Databricks Case Study:**

Databricks achieved top single-model performance on the [BIRD benchmark](https://www.databricks.com/blog/power-rlvr-training-leading-sql-reasoning-model-databricks) using:
- Execution-based verifiers (primary signal)
- Schema validation (secondary signal)
- Difficulty-stratified sampling

Key insight: Execution checking scales better than pattern matching or query similarity metrics.

### Domain 3: Writing & Creative Tasks (Hard Mode)

**Pattern: Rubrics as Rewards**

This is Scale AI's [Rubrics as Rewards (RaR)](https://scale.com/blog/rubrics-as-rewards) approach:

```python
def writing_rubric_verifier(output: str, requirements: dict) -> float:
    """
    Multi-criterion scoring for structured writing
    Each criterion is a binary check
    """
    score = 0.0
    total_criteria = len(requirements)

    for criterion_name, check_fn in requirements.items():
        if check_fn(output):
            score += 1.0 / total_criteria

    return score

# Example: Technical documentation rubric
requirements = {
    'has_introduction': lambda text:
        'introduction' in text.lower()[:300],

    'meets_length': lambda text:
        300 <= len(text.split()) <= 500,

    'includes_examples': lambda text:
        text.lower().count('example') >= 2,

    'has_code_block': lambda text:
        '```' in text,

    'proper_conclusion': lambda text:
        any(phrase in text.lower()[-200:]
            for phrase in ['in conclusion', 'to summarize', 'in summary']),
}

reward = writing_rubric_verifier(output, requirements)
```

**The Challenge:**

Subjective quality (voice, tone, creativity) is hard to verify. Rubrics can check structure but not artistry.

**Reality Check:**
DPO often outperforms rubric-based RLVR on truly creative tasks. Use rubrics for structured documents, not creative writing.

**When to Use Rubrics:**
- ✅ Technical documentation
- ✅ Report generation with specific sections
- ✅ Format compliance (citations, structure)
- ✅ Factual accuracy requirements

**When to Use DPO Instead:**
- ❌ Brand voice, marketing copy
- ❌ Creative fiction, storytelling
- ❌ Nuanced argumentation
- ❌ Stylistic consistency

### Domain 4: High-Stakes Domains (Expert Mode)

**Medical/Legal Example: Citation Verification**

```python
def medical_citation_verifier(
    output: str,
    trusted_sources: set
) -> float:
    """
    Verify medical claims include proper citations
    Critical for high-stakes domains
    """
    import re

    # Extract citation markers [1], [2], etc.
    citations = re.findall(r'\[(\d+)\]', output)

    if not citations:
        return 0.0  # No citations = fail

    # Extract reference list
    references = extract_references(output)

    score = 0.0
    for cite_num in citations:
        source = references.get(int(cite_num))
        if source and is_trusted_source(source, trusted_sources):
            score += 1.0 / len(citations)

    return score
```

**Pattern: Guideline Compliance**

```python
def medical_guideline_verifier(
    output: str,
    clinical_guidelines: dict
) -> float:
    """
    Check output doesn't contradict established guidelines
    Binary: any contradiction = fail
    """
    recommendations = extract_medical_recommendations(output)

    for rec in recommendations:
        if contradicts_guideline(rec, clinical_guidelines):
            return 0.0  # Hard fail on any contradiction

    return 1.0  # All recommendations align with guidelines
```

:::danger Critical Caveat for High-Stakes Domains

Partial verifiers in medical/legal contexts are dangerous. A verifier that checks citations but not accuracy, or structure but not soundness, can produce confident but incorrect outputs.

**Hybrid approaches are necessary:**
- Verifiers for structure, format, citations
- Human expert review for correctness and nuance
- Multi-stage verification (automated → expert review)

Never deploy RLVR in high-stakes domains with verification gaps.

:::

### Verifier Design Anti-Patterns

**❌ Anti-Pattern 1: Keyword Matching**

```python
# BAD: Easily gamed
def bad_verifier(output: str) -> float:
    if "correct answer" in output.lower():
        return 1.0
    return 0.0

# What happens:
# Model learns to just say "The correct answer is..."
# without actually solving anything
```

**❌ Anti-Pattern 2: Overcomplicated Verifiers**

```python
# BAD: Slow, brittle, hard to debug
def bad_verifier(output: str) -> float:
    # Parse with NLP (2 seconds)
    parsed = nlp_model.parse(output)

    # Compute semantic similarity (1 second)
    embedding = get_embedding(output)
    score = cosine_similarity(embedding, reference_embedding)

    # Call GPT-4 as judge (3 seconds)
    llm_score = gpt4_judge(output)

    # Total: 6+ seconds per verification
    # Training becomes unbearably slow
    return (score + llm_score) / 2
```

**❌ Anti-Pattern 3: Non-Deterministic Verifiers**

```python
# BAD: Different reward for same output
def bad_verifier(output: str) -> float:
    # Calling external API (may fail, change over time)
    result = external_api.score(output)
    return result.score

# Problems:
# 1. Same output gets different rewards across runs
# 2. API failures break training
# 3. API changes invalidate previous training
```

**❌ Anti-Pattern 4: Verifiers with Side Effects**

```python
# BAD: Dangerous side effects
def bad_verifier(output: str) -> float:
    # Writing to database during verification
    db.log_output(output)

    # Making expensive API calls
    cost = api.analyze(output)  # Costs money per call

    return score
```

### ✅ Good Verifier Principles

**1. Fast (< 100ms per check)**
```python
# Target: Verify 1000 outputs in < 2 minutes
import time

start = time.time()
rewards = [verifier(output, answer) for output, answer in test_cases]
elapsed = time.time() - start

print(f"Average: {elapsed/len(test_cases)*1000:.1f}ms per check")
# Goal: < 100ms
```

**2. Deterministic (Same input → Same output)**
```python
# Test determinism
output = "The answer is 42"
reward1 = verifier(output, 42)
reward2 = verifier(output, 42)
assert reward1 == reward2, "Verifier is non-deterministic!"
```

**3. High Coverage (>90% of errors caught)**
```python
# Build adversarial test suite
error_cases = [
    ("Wrong answer", 0.0),
    ("No answer given", 0.0),
    ("Correct answer", 1.0),
    ("Off by one", 0.0),
    ("Correct but wrong format", 1.0),  # Should still pass
]

coverage = sum(1 for case, expected in error_cases
               if (verifier(case) > 0.5) == (expected > 0.5))
coverage_rate = coverage / len(error_cases)

print(f"Coverage: {coverage_rate*100:.1f}%")
# Goal: >90%
```

**4. Interpretable (Easy to debug)**
```python
# Add logging for debugging
def interpretable_verifier(output: str, answer: float) -> float:
    import re
    numbers = re.findall(r'-?\d+\.?\d*', output)

    if not numbers:
        logger.debug(f"No numbers found in: {output[:50]}")
        return 0.0

    extracted = float(numbers[-1])
    correct = abs(extracted - answer) < 0.01

    logger.debug(f"Extracted: {extracted}, Expected: {answer}, Match: {correct}")

    return 1.0 if correct else 0.0
```

**5. Safe (No side effects, sandboxed)**
```python
# Use sandboxing for code execution
import subprocess
import tempfile

def safe_code_verifier(code: str, tests: str) -> float:
    """
    Execute code in isolated subprocess with timeout
    """
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py') as f:
        f.write(code + "\n" + tests)
        f.flush()

        try:
            result = subprocess.run(
                ['python', f.name],
                timeout=5,  # 5 second timeout
                capture_output=True,
                text=True
            )
            return 1.0 if result.returncode == 0 else 0.0
        except subprocess.TimeoutExpired:
            return 0.0
```

## Testing Your RLVR System

Once you've trained a model with RLVR, you need to validate two things: (1) Is the model actually better? (2) Is your verifier reliable?

This is where evaluation harnesses come in. Unlike verifiers (which provide training rewards), evaluation tools test whether training worked.

### The Distinction: Training vs Evaluation

```
┌─────────────────────────────────────────┐
│  DURING TRAINING (Verifiers)           │
├─────────────────────────────────────────┤
│  • Provide rewards to RL algorithm      │
│  • Run millions of times                │
│  • Must be fast (<100ms)                │
│  • Part of training loop                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  AFTER TRAINING (Evaluation)            │
├─────────────────────────────────────────┤
│  • Test if training worked              │
│  • Run once per checkpoint              │
│  • Can be slower (seconds OK)           │
│  • Separate from training loop          │
└─────────────────────────────────────────┘
```

### Evaluating Model Quality

**The Core Metrics:**

```python
def evaluate_rlvr_model(model, test_set, k=8):
    """
    Comprehensive RLVR evaluation
    """
    results = {
        'pass@1': 0,      # Deployment metric
        'pass@k': 0,      # Capability metric
        'avg_attempts': 0, # Efficiency metric
        'total': len(test_set)
    }

    for problem in test_set:
        # Generate K solutions
        solutions = model.generate(problem, num_samples=k)

        # Verify each solution
        rewards = [verifier(sol, problem.answer) for sol in solutions]

        # Compute metrics
        results['pass@1'] += int(rewards[0] > 0.5)
        results['pass@k'] += int(any(r > 0.5 for r in rewards))

        # How many attempts until first success?
        for i, r in enumerate(rewards):
            if r > 0.5:
                results['avg_attempts'] += (i + 1)
                break
        else:
            results['avg_attempts'] += k  # Failed all attempts

    # Convert to percentages/averages
    results['pass@1'] = 100 * results['pass@1'] / results['total']
    results['pass@k'] = 100 * results['pass@k'] / results['total']
    results['avg_attempts'] = results['avg_attempts'] / results['total']

    return results
```

**Interpreting Results:**

| Scenario | pass@1 | pass@K | Interpretation |
|----------|--------|--------|----------------|
| **Scenario 1** | ↑↑ | ↑ | Real capability gain + compression |
| **Scenario 2** | ↑↑ | → | Pure search compression |
| **Scenario 3** | ↑ | ↓ | Mode collapse (RED FLAG) |
| **Scenario 4** | → | ↑ | Wider search, poor selection |

**Example Analysis:**

```python
base_results = evaluate_rlvr_model(base_model, test_set)
rlvr_results = evaluate_rlvr_model(rlvr_model, test_set)

# Calculate gains
compression_gain = rlvr_results['pass@1'] - base_results['pass@1']
capability_gain = rlvr_results['pass@k'] - base_results['pass@k']

print(f"Compression: +{compression_gain:.1f}pp")
print(f"Capability: +{capability_gain:.1f}pp")

if capability_gain > 5:
    print("✓ Genuine learning occurred")
elif compression_gain > 15:
    print("✓ Strong efficiency gains")
else:
    print("⚠ Modest improvements, investigate further")
```

### Evaluating Verifier Quality

Your verifier needs its own test suite. Create known-bad outputs that should fail verification.

**Adversarial Test Suite:**

```python
# Test suite for a math verifier
adversarial_cases = [
    {
        'output': 'The answer is 42',
        'expected_answer': 1073,
        'should_pass': False,
        'test_name': 'incorrect_answer'
    },
    {
        'output': 'I cannot solve this problem.',
        'expected_answer': 1073,
        'should_pass': False,
        'test_name': 'no_answer_given'
    },
    {
        'output': 'Let me think... 1073... wait, actually 1072',
        'expected_answer': 1073,
        'should_pass': False,
        'test_name': 'wrong_final_answer'
    },
    {
        'output': '1073 is the answer but I am not sure',
        'expected_answer': 1073,
        'should_pass': True,  # Verifier should ignore uncertainty
        'test_name': 'correct_with_hedging'
    },
    {
        'output': '37 × 29 = 1,073',
        'expected_answer': 1073,
        'should_pass': True,
        'test_name': 'correct_with_formatting'
    },
]

def test_verifier_coverage(verifier, test_cases):
    """
    Measure verifier's ability to catch errors
    """
    failures = []

    for case in test_cases:
        result = verifier(case['output'], case['expected_answer'])
        passed = (result > 0.5)

        if passed != case['should_pass']:
            failures.append({
                'test': case['test_name'],
                'expected': case['should_pass'],
                'actual': passed,
                'output': case['output']
            })

    coverage = 1 - (len(failures) / len(test_cases))

    print(f"Verifier Coverage: {coverage*100:.1f}%")
    if failures:
        print("\nFailed cases:")
        for f in failures:
            print(f"  ❌ {f['test']}: expected {f['expected']}, got {f['actual']}")

    return coverage, failures

# Run test
coverage, failures = test_verifier_coverage(math_verifier, adversarial_cases)

if coverage < 0.9:
    print("⚠️ WARNING: Coverage below 90%, verifier has exploitable gaps")
```

**Coverage Analysis:**

```
Target: >90% coverage
Warning: 70-90% coverage
Danger: <70% coverage (models will exploit gaps)
```

### Detecting Reward Hacking

**Test 1: Random Baseline Comparison**

```python
def random_baseline_test(model, dataset):
    """
    Train with random rewards - should see ZERO improvement
    """
    # Train with actual verifier
    actual_verifier = lambda output, answer: check_correctness(output, answer)
    actual_results = train_rlvr(model, dataset, actual_verifier)

    # Train with random rewards
    import random
    random_verifier = lambda output, answer: random.choice([0.0, 1.0])
    random_results = train_rlvr(model, dataset, random_verifier)

    # Compare improvements from base
    actual_improvement = actual_results['pass@1'] - model.base_pass_at_1
    random_improvement = random_results['pass@1'] - model.base_pass_at_1

    print(f"Actual RLVR: +{actual_improvement:.1f}pp")
    print(f"Random rewards: +{random_improvement:.1f}pp")

    if random_improvement > 5:
        print("⚠️ WARNING: Spurious rewards detected!")
        print("Model family may be sensitive to reward distribution")
        return False

    return True
```

**Test 2: Reward Distribution Monitoring**

```python
def monitor_training_health(training_log):
    """
    Track reward statistics across training
    Red flags indicate training issues
    """
    for checkpoint_idx, checkpoint in enumerate(training_log):
        rewards = checkpoint['rewards']
        entropy = checkpoint['entropy']
        kl_div = checkpoint['kl_divergence']

        print(f"\nCheckpoint {checkpoint_idx}:")
        print(f"  Reward mean: {np.mean(rewards):.3f}")
        print(f"  Reward std: {np.std(rewards):.3f}")
        print(f"  Entropy: {entropy:.3f}")
        print(f"  KL divergence: {kl_div:.3f}")

        # Red flags
        if np.std(rewards) < 0.1:
            print("  ⚠️ Reward variance collapsed")

        if np.mean(rewards) > 0.95:
            print("  ⚠️ Near-perfect rewards (possible overfitting)")

        if np.mean(rewards) < 0.05:
            print("  ⚠️ Near-zero rewards (failing to learn)")

        if entropy < 2.0:  # Domain-specific threshold
            print("  ⚠️ Entropy too low (mode collapse)")

        if kl_div > 10.0:
            print("  ⚠️ KL divergence exploding (too far from base)")
```

### Using Evaluation Harnesses

After RLVR training completes, use standard evaluation tools to test your model.

**Popular options:**
- **[lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness):** Standard benchmarks (GSM8K, MMLU, etc.)
- **[Promptfoo](https://promptfoo.dev):** Custom evaluations with your verifiers
- **[OpenAI Evals](https://github.com/openai/evals):** Template-based evaluation framework
- **Custom scripts:** For domain-specific testing

**What to evaluate:**

```yaml
# Example evaluation plan

# 1. Standard benchmarks
- GSM8K (math reasoning)
- HumanEval (code generation)
- BIRD (text-to-SQL)
# Use your training verifier as the metric

# 2. Regression tests
- MMLU (general knowledge)
- HellaSwag (commonsense)
# Ensure RLVR didn't hurt base capabilities

# 3. Domain-specific
- Your custom test set
- Edge cases and adversarial examples
# Check robustness
```

**The Key Distinction:**

```
Training loop (RLVR):
├─ Verifier provides rewards
├─ Runs millions of times
└─ Must be fast (<100ms)

Evaluation (After training):
├─ Tests if model improved
├─ Runs once per checkpoint
└─ Can use your verifier OR other metrics
```

Evaluation harnesses sit in the second category—they're for validation, not training.

## Open Questions & What's Next

RLVR is maturing rapidly, but key questions remain unanswered. Here's what we don't know yet and what to watch for.

### What We Don't Know Yet

**Q1: How do we handle partial verifiers at scale?**

Current approaches:
- Intent checks (secondary verifiers)
- Tripwires (detect exploitation attempts)
- Adversarial data flywheels

Open problem:
- Automated verifier coverage analysis
- Self-improving verifiers that detect their own gaps
- Multi-verifier composition strategies

**Q2: Do RLVR gains transfer across model families?**

Evidence so far:
- Mixed results across families
- Some families show spurious reward sensitivity
- Optimal hyperparameters vary significantly

What we need:
- Cross-family benchmarking standards
- Understanding of family-specific quirks
- Guidance on when to expect transfer

**Q3: What are the scaling laws for RLVR?**

For pretraining, we have Chinchilla scaling laws. For RLVR, we barely know:
- How gains scale with compute
- When returns diminish
- Optimal ratio of SFT:RLVR data
- How verifier quality affects scaling

This is a critical open research area.

**Q4: Can we expand RLVR beyond deterministic verifiers?**

Current RLVR works best with binary correctness. Can we extend to:
- Fuzzy verifiers with confidence scores
- Learned verifiers that improve over time
- Hybrid human-AI verification

### What to Watch in 2025-2026

**1. Multi-Verifier Composition**

Instead of one verifier, chain multiple checks:

```python
def composite_verifier(output, problem):
    """
    Multiple verification stages
    """
    checks = {
        'syntax': check_syntax(output),          # 20% weight
        'correctness': check_correctness(output), # 50% weight
        'efficiency': check_efficiency(output),   # 15% weight
        'style': check_style(output)              # 15% weight
    }

    # Weighted combination
    score = sum(weight * checks[name]
                for name, weight in weights.items())
    return score
```

Watch for frameworks that make this composable and maintainable.

**2. Self-Play + RLVR Hybrids**

Models generate harder problems for themselves:

```
1. Model solves current problem set
2. Model generates variants (harder problems)
3. Train on new, harder problems
4. Repeat
```

This could expand capabilities beyond static datasets.

**3. Enterprise Tooling Maturation**

Current RLVR requires significant engineering. Watch for:
- Verifier template libraries
- Automated coverage testing tools
- Managed RLVR training services
- Better debugging and monitoring tools

**4. Regulatory Implications**

As RLVR becomes standard for high-stakes domains:
- Verifier auditing standards
- Certification for medical/legal verifiers
- Liability frameworks for verification gaps

### Falsifiable Predictions

Here are three specific predictions that would change our understanding:

**Prediction 1 (By Q4 2025):**
Someone demonstrates RLVR working reliably on creative writing tasks using rubric-only verifiers, matching DPO performance on human evaluation.

**Why it matters:**
Would expand RLVR beyond deterministic correctness into subjective quality.

**What would falsify it:**
Multiple attempts show DPO consistently outperforms rubric-based RLVR on creative tasks.

---

**Prediction 2 (By Q2 2026):**
A major lab publishes RLVR scaling laws showing diminishing returns past 100B training tokens for a given verifier quality level.

**Why it matters:**
Would establish when to stop scaling RLVR and invest in better verifiers instead.

**What would falsify it:**
Linear or super-linear gains continue beyond 100B tokens.

---

**Prediction 3 (By end of 2026):**
RLVR becomes the default for >50% of post-training compute at frontier labs, overtaking RLHF/DPO for reasoning models.

**Why it matters:**
Would confirm RLVR as the dominant paradigm for reasoning model training.

**What would falsify it:**
- Hybrid approaches dominate instead
- New methods (neither RLVR nor RLHF) emerge
- RLVR fails to scale to frontier model sizes

## Should You Use RLVR?

Here's the decision framework.

### Decision Tree

```
Do you have objective correctness criteria?
│
├─ YES → Can you write a verifier covering >90% of errors?
│   │
│   ├─ YES → RLVR is worth trying
│   │   └─ Start: Small pilot, compare to DPO baseline
│   │
│   └─ NO → Fix verifier coverage first
│       └─ Build adversarial test suite
│       └─ Iterate on verifier design
│
└─ NO → Stick with DPO/RLHF
    └─ Unless you can decompose task into verifiable sub-tasks
```

### Budget-Based Guidance

**Budget < $10K:**
```
✓ Use open-source models (Llama, Mistral)
✓ Start with math/code (easy verifiers)
✓ Train on single GPU or small cluster
✓ Use existing benchmarks (GSM8K, HumanEval)
```

**Budget $10K-$100K:**
```
✓ Fine-tune mid-size models on your domain
✓ Build custom verifiers for your use case
✓ Compare RLVR vs DPO vs hybrid
✓ Invest in verifier coverage testing
```

**Budget > $100K:**
```
✓ Hybrid approach: RLVR for verifiable + DPO for quality
✓ Multi-stage verification pipelines
✓ Cross-family validation
✓ Production monitoring and evaluation infrastructure
```

### Final Takeaways

:::tip ✅ Use RLVR when:

- You have objective correctness criteria
- Your verifier covers >90% of errors
- Your domain is stable (not rapidly changing)
- You can monitor for reward gaming
- Compute budget allows experimentation

:::

:::warning ⚠️ Watch out for:

- Partial verifier exploitation (test coverage!)
- Spurious rewards (run random baseline)
- Entropy instability (monitor KL divergence)
- Family-specific quirks (validate across models)
- High-stakes domains (require hybrid human review)

:::

:::info 🔮 Coming soon:

- Multi-verifier composition frameworks
- Better tooling for verifier coverage analysis
- RLVR as default for reasoning model training
- Integration with self-play and curriculum learning
- Industry standards for verifier auditing

:::

## Conclusion

RLVR represents a fundamental shift in how we train reasoning models. By replacing learned reward models with programmatic verifiers, we can achieve:

- **65-75% cost reduction** on verifiable tasks
- **Faster iteration** (days instead of weeks)
- **Deterministic feedback** (same input → same reward)
- **Scalable training** (verifiers run in milliseconds)

But RLVR isn't magic. It works where ground truth exists and fails where quality is subjective. The key is choosing the right tool:

- **RLVR:** Verifiable correctness (math, code, SQL)
- **DPO:** Subjective quality (style, tone, creativity)
- **Hybrid:** Complex applications requiring both

As the field matures, expect RLVR to become standard for reasoning model training, with better tooling, clearer best practices, and expanded application domains.

The Bitter Lesson applies: general methods plus compute beat hand-crafted labels. Where you can write a checker, you can scale learning.

---

## Resources

**Key Papers:**
- [Quantile Advantage Estimation](https://arxiv.org/abs/2509.22611) (2025) - Fixing entropy instability
- [Hidden Costs of RLVR](https://arxiv.org/abs/2509.21882) (2025) - Measurement gaps
- [RLVR Incentivizes Reasoning](https://arxiv.org/abs/2506.14245) (2025) - Efficiency vs capability debate
- [Spurious Rewards](https://arxiv.org/abs/2506.10947) (2025) - Random reward sensitivity
- [Adaptive Guidance](https://arxiv.org/abs/2506.13923) (2025) - Expanding capabilities

**Industry Applications:**
- [Databricks RLVR](https://www.databricks.com/blog/power-rlvr-training-leading-sql-reasoning-model-databricks) - Text2SQL case study
- [Scale AI Rubrics as Rewards](https://scale.com/blog/rubrics-as-rewards) - Extending RLVR
- [Menlo Ventures Analysis](https://menlovc.com/perspective/2025-mid-year-llm-market-update/) - Market perspective

**Training Frameworks:**
- [trlX](https://github.com/CarperAI/trlx) - RL for language models
- [OpenRLHF](https://github.com/OpenRLHF/OpenRLHF) - Open-source RLHF/RLVR
- [TRL](https://github.com/huggingface/trl) - Hugging Face RL library

**Evaluation Tools:**
- [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) - Standard benchmarks
- [Promptfoo](https://promptfoo.dev) - Custom evaluations
- [OpenAI Evals](https://github.com/openai/evals) - Evaluation framework

**Background:**
- [The Bitter Lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html) - Rich Sutton (2019)
- [Tülu 3 Technical Report](https://allenai.org/blog/tulu-3-technical) - Named RLVR stage

---

*Have thoughts on RLVR? Found issues with this analysis? Open a discussion or share your experience with verifiable rewards in production.*