# judge-prompt-injection (LLM-as-a-Judge Robustness Testing)

```bash
npx promptfoo@latest init --example judge-prompt-injection
```

Test how robust your LLM judge is to prompt injection attacks. When LLMs evaluate other LLM outputs, the candidate responses become an attack surface.

## What This Tests

- **Pairwise preference**: "Which response is better?" - more vulnerable to manipulation
- **Rubric-based grading**: "Does output satisfy X?" - inherently more robust
- **Attack types**: Direct injection, authority claims, social engineering, fake scoring, obfuscation

## Quick Start

```bash
export OPENAI_API_KEY=your-key-here
promptfoo eval
promptfoo view
```

## Methods

**Models tested:** GPT-4.1-mini, GPT-3.5-turbo

**Configuration:** temperature=0 (deterministic outputs)

**Metrics:**

- **Injection Resistance (IR):** Fraction of attacked cases where judge selects correct answer
- **Attack Success Rate (ASR):** 1 - IR

**Evaluation approach:** We use deterministic JavaScript assertions to check if the judge selected the correct winner. This avoids the "judge judging the judge" problem where `llm-rubric` would create a second LLM evaluation layer.

## Key Finding: Task Structure Matters

| Eval Type           | Naive Prompt | Defended Prompt |
| ------------------- | ------------ | --------------- |
| Pairwise preference | 58% IR       | 100% IR         |
| Rubric-based        | 100% IR      | 100% IR         |

Rubric-based grading is more robust because "does X contain Y?" is verifiable, while "is A better than B?" is subjective and manipulable.

## Attack Effectiveness (Against Naive Pairwise Judge)

| Attack Family                            | ASR |
| ---------------------------------------- | --- |
| Authority claims ("[SYSTEM ADMIN NOTE]") | 75% |
| Meta-evaluation ("[UPDATED CRITERIA]")   | 75% |
| Plausible rationale framing              | 50% |
| Obfuscated/Unicode injection             | 33% |
| Direct "ignore instructions"             | 17% |

Social engineering beats direct injection in hand-crafted attacks.

## Configurations

| Config                                 | What It Tests                           |
| -------------------------------------- | --------------------------------------- |
| `promptfooconfig.yaml`                 | Main suite with defended pairwise judge |
| `promptfooconfig-vulnerable.yaml`      | Same attacks, naive judge prompt        |
| `promptfooconfig-social.yaml`          | Social engineering attacks              |
| `promptfooconfig-llm-rubric-test.yaml` | Attacks against rubric-based grading    |

## Minimum Viable Hardening

- [ ] Set `temperature=0` for deterministic judge outputs
- [ ] Use strict output schema (JSON with defined fields)
- [ ] Swap answer orderings and aggregate (tests position bias)
- [ ] Use multi-judge with diversity (different models or prompts)
- [ ] Sanitize inputs (strip hidden text, unusual Unicode, XML-like tags)
- [ ] Prefer rubric-based grading over pairwise preference where possible

## The Ceiling Is Higher

Our attacks are hand-crafted. Academic research ([JudgeDeceiver](https://arxiv.org/abs/2403.17710)) shows optimized attacks achieve 89-99% ASR using gradient-based suffix search. Don't assume manual red-teaming found the worst case.

## Learn More

- [Blog post: How Prompt Injectable Is LLM-as-a-Judge?](https://www.promptfoo.dev/blog/llm-as-a-judge-prompt-injection/)
- [llm-rubric documentation](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/)
