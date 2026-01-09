# judge-prompt-injection (LLM-as-a-Judge Robustness Testing)

```bash
npx promptfoo@latest init --example judge-prompt-injection
```

Test how robust your LLM judge is to prompt injection attacks. When LLMs evaluate other LLM outputs, the candidate responses become an attack surface.

## What This Tests

- **Pairwise preference**: "Which response is better?" - more vulnerable to manipulation
- **Rubric-based grading**: "Does output satisfy X?" - inherently more robust
- **Attack types**: Direct injection, authority claims, social engineering, fake scoring

## Quick Start

```bash
export OPENAI_API_KEY=your-key-here
promptfoo eval
promptfoo view
```

## Key Finding: Task Structure Matters

| Eval Type           | Naive Prompt   | Defended Prompt |
| ------------------- | -------------- | --------------- |
| Pairwise preference | 54% resistant  | 96% resistant   |
| Rubric-based        | 100% resistant | 100% resistant  |

Rubric-based grading is more robust because "does X contain Y?" is verifiable, while "is A better than B?" is subjective and manipulable.

## Attack Types That Work

Against pairwise judges without defensive prompting:

| Attack                                   | Success Rate |
| ---------------------------------------- | ------------ |
| Authority claims ("[SYSTEM ADMIN NOTE]") | 75%          |
| Meta-evaluation ("[UPDATED CRITERIA]")   | 75%          |
| Plausible rationale framing              | 50%          |
| Direct "ignore instructions"             | 17%          |

Social engineering beats direct injection.

## Configurations

| Config                                 | What It Tests                           |
| -------------------------------------- | --------------------------------------- |
| `promptfooconfig.yaml`                 | Main suite with defended pairwise judge |
| `promptfooconfig-vulnerable.yaml`      | Same attacks, naive judge prompt        |
| `promptfooconfig-social.yaml`          | Social engineering attacks              |
| `promptfooconfig-llm-rubric-test.yaml` | Attacks against rubric-based grading    |

## The Ceiling Is Higher

Our attacks are hand-crafted. Academic research ([JudgeDeceiver](https://arxiv.org/abs/2403.17710)) shows optimized attacks achieve 89-99% success. Don't assume manual red-teaming found the worst case.

## Learn More

- [Blog post: How Prompt Injectable Is LLM-as-a-Judge?](https://www.promptfoo.dev/blog/llm-as-a-judge-prompt-injection/)
- [llm-rubric documentation](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/)
