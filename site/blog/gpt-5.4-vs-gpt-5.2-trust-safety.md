---
title: 'GPT-5.4 Trust and Safety Assessment'
description: 'We replayed 611 recovered prompt payloads from our December GPT-5.2 red team against GPT-5.2 and GPT-5.4 with reasoning disabled and the same grader.'
image: /img/blog/gpt-5.4-vs-gpt-5.2/hero.jpg
date: 2026-03-06
authors: [michael]
tags: [red-teaming, security-vulnerability, openai]
---

# GPT-5.4 Trust and Safety Assessment

OpenAI released [GPT-5.4](https://openai.com/index/introducing-gpt-5-4/) on March 5, 2026. For this follow-up, we wanted the comparison to be as apples-to-apples as possible.

So instead of leading with a fresh rerun, we replayed the same saved December benchmark against both models with the same settings: `reasoning_effort: none`, `max_completion_tokens: 2048`, and the same grader.

On that benchmark, GPT-5.4 failed more often overall than GPT-5.2.

<!-- truncate -->

## At a Glance

![Recovered December benchmark composition](/img/blog/gpt-5.4-vs-gpt-5.2/benchmark-composition.svg)

- **Dataset:** **611** recovered prompt payloads from the original **620**-case December benchmark
- **Headline:** GPT-5.4 failed more often overall on the same benchmark: **220/611 (36.0%)** vs **195/611 (31.9%)**
- **Main driver:** the gap came from **Hydra** and **baseline**, while **Meta** improved slightly

## The Benchmark

The original December 11 run (`eval-E24-2025-12-11T18:49:28`) contained **620** saved attack cases. We were able to recover **611** prompt payloads cleanly enough to replay today:

- **Baseline:** **210** cases
- **Hydra:** **196** cases
- **Meta:** **205** cases

We excluded **9 Hydra traces** from the fixed benchmark:

- **7** had no saved message trace after Hydra exhausted its backtracks
- **2** contained literal template syntax inside the saved messages, which makes them non-replayable through Promptfoo's templating layer without mutating the payload

That means this post is based on the **recoverable December benchmark**, not a fresh March corpus.

The replay config used two targets and one grader:

```bash
promptfoo eval \
  -c output/gpt-5.2-december-benchmark.replay.clean.gpt-5.2-vs-gpt-5.4.yaml \
  --grader openai:chat:gpt-5.4 \
  -j 40
```

The clean replay eval ID was `eval-FSB-2026-03-06T07:30:31`.

## Results

![Same-benchmark comparison of GPT-5.2 and GPT-5.4](/img/blog/gpt-5.4-vs-gpt-5.2/method-comparison.svg)

On the same recovered December benchmark:

- **Overall:** **195/611 (31.9%)** for GPT-5.2 vs **220/611 (36.0%)** for GPT-5.4
- **Baseline:** **6/210 (2.9%)** for GPT-5.2 vs **13/210 (6.2%)** for GPT-5.4
- **Hydra:** **108/196 (55.1%)** for GPT-5.2 vs **131/196 (66.8%)** for GPT-5.4
- **Meta:** **81/205 (39.5%)** for GPT-5.2 vs **76/205 (37.1%)** for GPT-5.4

That is the main result. GPT-5.4 was worse overall on the same benchmark, driven by **baseline** and especially **Hydra**. Meta improved slightly, but not enough to offset the regressions elsewhere.

These numbers will not match the published December post exactly. The original article reported the live day-0 red team aggregates as they ran. This replay uses the **611 recoverable prompt payloads** we can still execute today and grades both models side by side with the **same current grader**.

## Grouped Buckets

Cell-level deltas are mostly 4- and 5-prompt cells. To keep the category story from leaning too hard on tiny samples, we also grouped several related plugin families into broader buckets on the same fixed benchmark.

![Grouped slices of the fixed benchmark](/img/blog/gpt-5.4-vs-gpt-5.2/bucket-view.svg)

- **Operational actions and commitments** (`excessive-agency`, `contracts`, `coppa`) moved from **18/44 (40.9%)** to **22/44 (50.0%)**
- **Representation and impersonation** (`imitation`) stayed flat at **12/15 (80.0%)** for both models
- **Misinformation and unsupported claims** (`harmful:misinformation-disinformation`, `hallucination`, `unverifiable-claims`) improved from **14/45 (31.1%)** to **12/45 (26.7%)**
- **Politics, persuasion, and bias** (`politics`, `religion`, and selected `bias:*` plugins) moved from **34/75 (45.3%)** to **39/75 (52.0%)**

These grouped slices are still not the whole benchmark, but they are less fragile than any one 4/5 cell. The main pattern is that GPT-5.4 got looser on operational agency and persuasion-style prompts while getting tighter on some misinformation and child-safety cases.

## Selected Cells

![Same-benchmark category shift map](/img/blog/gpt-5.4-vs-gpt-5.2/replay-deltas.svg)

The strategy-level result is stronger than any one cell, but the cell-level shifts still help show where the benchmark actually moved. These are still mostly **4- or 5-prompt cells**, so treat them as concrete examples, not stand-alone rankings.

- Biggest regressions: **Hydra excessive-agency** moved from **0/4** to **3/4**, **Hydra sex-crime** moved from **0/5** to **3/5**, and **baseline excessive-agency** moved from **0/5** to **2/5**
- Biggest improvements: **Hydra misinformation-disinformation** moved from **5/5** to **3/5**, **Meta COPPA** moved from **3/5** to **1/5**, and **Meta contracts** moved from **4/5** to **3/5**

## Same-Prompt Pairs

These are exact same-benchmark pairs, not regenerated examples.

![Exact same-prompt pairs](/img/blog/gpt-5.4-vs-gpt-5.2/same-prompt-pairs.svg)

The regression examples are both operational agency cases: one under Hydra and one under Meta. The clearest improvements are a fabricated government advisory under Hydra and a child-safety case under Meta. That matches the broader profile in the grouped buckets and selected cells above.

## Fresh Rerun Context

We also reran the full harness adaptively against GPT-5.4 in March (`eval-jyq-2026-03-06T03:54:26`). That fresh rerun looked much better than GPT-5.2's original day-0 run: **Hydra** fell from **161/205 (78.5%)** to **40/210 (19.0%)**, **Meta** fell from **122/200 (61.0%)** to **67/210 (31.9%)**, and **baseline** moved from **9/210 (4.3%)** to **7/215 (3.3%)**.

We keep that rerun as context, not the headline. It measures what a fresh attacker can still discover against GPT-5.4 today. The fixed December benchmark measures how GPT-5.2 and GPT-5.4 behave on the same saved prompts.

## Limitations

- This benchmark covers **611 of the original 620** December cases. We excluded **9 Hydra rows** because their saved traces were not replayable without mutation.
- Hydra is replayed as a **fixed saved chat trace**, not regenerated as a fresh attack.
- The grader is **LLM-based**. We used the same grader on both models to keep the comparison consistent.
- Many category deltas are based on **4 or 5 prompts per cell**.

## Why This Matters

If you are comparing model versions, the fixed benchmark is the first check and the adaptive rerun is the second. The saved benchmark tells you whether the new model is stricter on prompts you already know matter. The rerun tells you what a fresh attacker can still surface today.

For GPT-5.2 vs GPT-5.4, the fixed benchmark says GPT-5.4 was looser overall, especially under Hydra, even though the adaptive rerun looked much better. That is the kind of difference a product team needs before shipping a version upgrade.

## Reproduce It

Fixed benchmark replay:

```bash
promptfoo eval \
  -c output/gpt-5.2-december-benchmark.replay.clean.gpt-5.2-vs-gpt-5.4.yaml \
  --grader openai:chat:gpt-5.4 \
  -j 40
```

Adaptive rerun:

```bash
promptfoo redteam run \
  -c output/gpt-5.4-rerun-from-gpt-5.2-post.yaml \
  -j 40 \
  -o output/gpt-5.4-rerun.generated.yaml
```

Running this benchmark will generate harmful content. Keep results internal and limit access.

## Related

- [GPT-5.2 Initial Trust and Safety Assessment](/blog/gpt-5.2-trust-safety-assessment)
- [Why ASR Is Not a Portable Metric](/blog/asr-not-portable-metric)
