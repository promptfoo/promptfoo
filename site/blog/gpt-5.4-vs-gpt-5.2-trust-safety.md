---
title: 'GPT-5.4 Trust and Safety Assessment'
description: 'A March 2026 comparison of GPT-5.4 and GPT-5.2 on 611 recovered benchmark prompts, with reported failure counts, model settings, and limits of the assessment.'
image: /img/blog/gpt-5.4-vs-gpt-5.2/hero.jpg
date: 2026-03-06
authors: [michael]
tags: [red-teaming, security-vulnerability, openai]
---

# GPT-5.4 Trust and Safety Assessment

In this March 2026 assessment, GPT-5.4 failed **220 of 611 checks (36.0%)**, compared with **195 of 611 (31.9%)** for GPT-5.2. Both models received the same saved prompts and were assessed by the same model grader. Most of the difference came from the Hydra cases.

The prompts came from our December [GPT-5.2 trust and safety assessment](/blog/gpt-5.2-trust-safety-assessment). After OpenAI [released GPT-5.4 on March 5, 2026](https://openai.com/index/introducing-gpt-5-4/), we replayed the recoverable cases with `reasoning_effort: none` and `max_completion_tokens: 2048`. These results describe that benchmark and configuration; they do not establish a general safety ranking.

<!-- truncate -->

## The Benchmark

![Recovered December benchmark composition](/img/blog/gpt-5.4-vs-gpt-5.2/benchmark-composition.svg)

The December run (`eval-E24-2025-12-11T18:49:28`) contained 620 saved cases. We recovered 611 prompt payloads: 210 baseline, 196 Hydra, and 205 Meta cases. Of the nine excluded Hydra cases, seven lacked saved messages and two contained template syntax that prevented replay without changing the payload.

The March comparison (`eval-FSB-2026-03-06T07:30:31`) used `openai:chat:gpt-5.4` as the grader for both targets. The archived invocation used model aliases. OpenAI lists dated snapshots as [`gpt-5.2-2025-12-11`](https://developers.openai.com/api/docs/models/gpt-5.2) and [`gpt-5.4-2026-03-05`](https://developers.openai.com/api/docs/models/gpt-5.4); the recorded aliases do not prove which snapshots served these requests.

The saved corpus, generated configurations, and row-level grades are not distributed with this post. The aggregate counts below are the reported assessment results. Readers can check their arithmetic, but cannot independently reproduce the grades from the published material.

## Results

![Same-benchmark comparison of GPT-5.2 and GPT-5.4](/img/blog/gpt-5.4-vs-gpt-5.2/method-comparison.svg)

| Cases    | GPT-5.2 failures | GPT-5.4 failures |
| -------- | ---------------- | ---------------- |
| Baseline | 6/210 (2.9%)     | 13/210 (6.2%)    |
| Hydra    | 108/196 (55.1%)  | 131/196 (66.8%)  |
| Meta     | 81/205 (39.5%)   | 76/205 (37.1%)   |
| Total    | 195/611 (31.9%)  | 220/611 (36.0%)  |

GPT-5.4 had 25 more failures: 23 more in Hydra and seven more in baseline, offset by five fewer in Meta. The December article reported grades from the original live run, so its totals differ from this replay with a shared March grader.

## Grouped Buckets

![Grouped categories in the fixed benchmark](/img/blog/gpt-5.4-vs-gpt-5.2/bucket-view.svg)

Several individual categories contain only four or five prompts. The following groups combine related categories, although they still cover only part of the benchmark.

| Group                          | Included categories                                                             | GPT-5.2 failures | GPT-5.4 failures |
| ------------------------------ | ------------------------------------------------------------------------------- | ---------------- | ---------------- |
| Actions and commitments        | `excessive-agency`, `contracts`, `coppa`                                        | 18/44 (40.9%)    | 22/44 (50.0%)    |
| Impersonation                  | `imitation`                                                                     | 12/15 (80.0%)    | 12/15 (80.0%)    |
| Misinformation claims          | `harmful:misinformation-disinformation`, `hallucination`, `unverifiable-claims` | 14/45 (31.1%)    | 12/45 (26.7%)    |
| Politics, persuasion, and bias | `politics`, `religion`, and selected `bias:*` categories                        | 34/75 (45.3%)    | 39/75 (52.0%)    |

The reported failures increased for actions and commitments and for politics, persuasion, and bias. Impersonation was unchanged, while misinformation failures decreased. These groups do not support conclusions about every prompt in those categories.

## Selected Cells

![Same-benchmark category differences](/img/blog/gpt-5.4-vs-gpt-5.2/replay-deltas.svg)

The largest reported increases were Hydra excessive-agency (0/4 to 3/4), Hydra sex-crime (0/5 to 3/5), and baseline excessive-agency (0/5 to 2/5). Decreases included Hydra misinformation-disinformation (5/5 to 3/5), Meta COPPA (3/5 to 1/5), and Meta contracts (4/5 to 3/5). With these small denominators, one response changes a category's rate by 20 or 25 percentage points.

## Same-Prompt Pairs

![Selected response excerpts from the fixed benchmark](/img/blog/gpt-5.4-vs-gpt-5.2/same-prompt-pairs.svg)

The assessment records illustrate differences in claimed ability to perform financial or file-management actions, fabricated government advice, and requests for children's personal information. The figure contains selected excerpts rather than complete conversations. A blank response is not itself evidence of a safety refusal; the row-level grades would be needed to assess that case.

## Fresh Rerun Context

A separate March assessment (`eval-jyq-2026-03-06T03:54:26`) generated new cases for GPT-5.4. Its reported failure rates were lower than those from GPT-5.2's December run:

| Cases    | GPT-5.2 December run | GPT-5.4 March run |
| -------- | -------------------- | ----------------- |
| Baseline | 9/210 (4.3%)         | 7/215 (3.3%)      |
| Hydra    | 161/205 (78.5%)      | 40/210 (19.0%)    |
| Meta     | 122/200 (61.0%)      | 67/210 (31.9%)    |

These runs used different generated prompts and denominators. They cannot isolate a model-version effect or overturn the comparison on the shared 611 prompts.

## Limitations

- Nine original cases could not be replayed without changing or reconstructing their messages.
- The replay used saved chat traces and an LLM grader. The post does not provide independent human grading.
- Many category results have four or five prompts, and the grouped categories cover selected parts of the benchmark.
- The archived model aliases may resolve differently over time.
- The underlying artifacts are unavailable in this post, so the empirical results cannot be independently verified from it.

The shared benchmark shows a higher graded failure rate for GPT-5.4 under these settings. The separately generated assessments show why failure rates from different prompt sets need to be interpreted with their methodology and denominators.

## Related

- [GPT-5.2 Initial Trust and Safety Assessment](/blog/gpt-5.2-trust-safety-assessment)
- [Why ASR Is Not a Portable Metric](/blog/asr-not-portable-metric)
