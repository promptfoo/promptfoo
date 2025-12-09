---
title: Your model upgrade just broke your agent's safety
description: LLM safety varies wildly between model families and even between versions. What agent developers need to know before their next upgrade.
image: /img/blog/model-upgrades-break-agent-safety/header.jpg
keywords:
  [
    LLM safety,
    model upgrade,
    AI agent security,
    jailbreak,
    GPT-5 safety,
    Claude 4.5 safety,
    o1 o3 safety,
    Gemini 3 safety,
    Llama 4 safety,
    red teaming,
    defense in depth,
    continuous testing,
    prompt injection,
  ]
date: 2025-12-08
authors: [shuo]
tags: [security-vulnerability, best-practices, agents]
---

# Your model upgrade just broke your agent's safety

You upgraded to the latest model. Better benchmarks, faster inference, lower cost. What could go wrong?

Turns out, a lot. The safety behaviors you relied on? They might not exist anymore.

<!-- truncate -->

## The uncomfortable truth

GPT-5's "[safe completions](https://openai.com/index/introducing-gpt-5/)" training makes it excellent at single-turn filtering—it can offer partial answers while maintaining safety boundaries on ambiguous queries. Claude 4.5's Constitutional AI excels at multi-turn pattern detection, catching gradual escalation attacks that slip past single-turn filters.

Different strengths. Different weaknesses. And here's what's counterintuitive: **newer models aren't automatically safer**.

The [DecodingTrust benchmark](https://decodingtrust.github.io/) (NeurIPS 2023 Outstanding Paper) found GPT-4 was more vulnerable to jailbreaking than GPT-3.5—because it follows misleading instructions more precisely. The [Lamb-Bench 2025](https://www.lakera.ai/blog/lamb-bench) study documented similar regressions: GPT-4o is safer than GPT-4.1, and Claude 3.5 Sonnet is safer than Claude 4.5 Sonnet on their metrics.

[NYU's SAGE-Eval study](https://arxiv.org/abs/2505.21828) tested 104 safety facts across 10,428 scenarios: even Claude 3.7 Sonnet—the top performer—failed on 42% of safety facts tested.

If you're building agents and assuming safety behaviors will transfer between models—or even between versions of the same model—you're in for a bad time.

## Each model family does safety differently

The three major providers take fundamentally different approaches to safety. These aren't cosmetic differences—they produce meaningfully different behaviors that will affect your agent.

### Claude: Constitutional AI + Multi-Turn Detection

Anthropic embeds ethical principles directly during training. The model learns to critique its own outputs against a "constitution" derived from the UN Declaration of Human Rights and trust & safety best practices.

Claude's strength is **multi-turn pattern detection**. While GPT-5 excels at single-turn filtering, Claude is trained to catch gradual escalation attacks (like Crescendo) that build over multiple messages. [Benchmarks show](https://aclanthology.org/2025.findings-acl.958.pdf) Claude 3.5 Sonnet achieved the highest accuracy in multi-turn conversations.

Anthropic's [Constitutional Classifiers](https://www.anthropic.com/research/constitutional-classifiers) reduced jailbreak success rates from 86% to 4.4%—but a red team challenge still found universal bypasses within 6 days of deployment.

Claude Opus 4.5 demonstrates industry-leading prompt injection resistance: just 4.7% attack success rate compared to 12.5% for Gemini 3 Pro and 21.9% for GPT-5.1 on combined direct/indirect injection tests.

### GPT-5 and o-series: Safe Completions + Deliberative Alignment

GPT-5 introduces "[safe completions](https://openai.com/index/introducing-gpt-5/)"—a training paradigm that excels at **single-turn filtering**. The model can offer partial answers or high-level information when detailed responses might pose risks, reducing unnecessary refusals while navigating dual-use queries.

The o1, o3, and o4-mini reasoning models add "deliberative alignment"—explicitly reasoning about safety policies in chain-of-thought before responding. o1 scores 84 vs 22 for GPT-4o on OpenAI's hardest jailbreak tests.

But progress isn't linear. [Fine-tuning can quickly undo safety alignment](https://venturebeat.com/ai/uh-oh-fine-tuning-llms-compromises-their-safety-study-finds/)—GPT-3.5 Turbo was jailbroken with just 10 adversarial examples costing under $0.20. And GPT-4o still shows ~6% attack success rate on standard HarmBench attacks, rising to 94.8% with advanced HarmNet attacks.

### Gemini: Configurable filters

Google uses probability-plus-severity scoring across configurable harm categories. Some filters (CSAM, PII) can't be disabled. Others are wide open depending on your model version.

Here's the gotcha: default blocking thresholds vary significantly between versions. Newer GA models default to `BLOCK_NONE` for most categories. Older models default to `BLOCK_SOME`. If you're upgrading Gemini and expecting consistent safety behavior, you need to explicitly configure it.

### Open-source: buyer beware

Meta's Llama 2 family is actually one of the safest open-source options—the [SAGE Framework](https://arxiv.org/abs/2504.19674) found "Llama-2 family of models are safest whereas both Mistral and Phi-3 families are significantly unsafe."

But here's the catch: the [BadLlama paper](https://arxiv.org/abs/2407.01376) proved safety fine-tuning can be removed from Llama 3 8B in 5 minutes on one A100 GPU for under $0.50. After that, a tiny "jailbreak adapter" (under 100MB) can strip guardrails from any copy instantly. It even works on free Google Colab (30 minutes, $0).

Mistral historically prioritized capability over safety. Their early models were described as having "almost no guardrails." The fundamental reality: open-source safety is optional and trivially removable.

| Model Family | Core Approach | Can Safety Be Removed? |
|-------------|---------------|----------------------|
| Claude (Sonnet 4, Opus 4) | Constitutional AI + Classifiers | No (API-enforced) |
| GPT-4o / o1 / o3 / o4-mini | RLHF + RBRMs + Deliberative Alignment | No (API-enforced) |
| Gemini 2.5 / Gemini 3 | Configurable filters + trained classifiers | No (API-enforced) |
| Llama 3 / Llama 4 | RLHF + Llama Guard (separate model) | Yes (open weights) |
| Mistral / Mixtral | Optional safe_prompt + Moderation API | Yes (minimal built-in) |

## Attack vectors expose different weaknesses

Different attacks reveal where each model family's defenses break down. If you're switching models, expect the threat landscape to shift.

### Multilingual attacks

RLHF-based alignment derives primarily from English corpora. Non-English prompts exist in what researchers call "blurred safety boundaries."

[Research shows](https://arxiv.org/abs/2310.06474) low-resource languages produce significantly higher likelihood of harmful content than high-resource languages. Bengali—spoken by 285 million people—showed particularly weak safety coverage across major models.

### Multi-turn manipulation

The [Crescendo attack](https://arxiv.org/abs/2404.01833) (USENIX Security 2025) outperforms single-turn jailbreaks by 29-61% on GPT-4 and 49-71% on Gemini-Pro. Results: 98% success on GPT-4 (49/50 tasks), 100% on Gemini-Pro—requiring an average of fewer than 5 interactions.

This is where Claude's multi-turn pattern detection shines—but this is also exactly why you can't assume GPT-5's strong single-turn filtering will protect against gradual escalation.

Your agent probably has multi-turn conversations. It's probably more vulnerable than you think.

### Prompt injection

Still unsolved across all LLMs. HiddenLayer's "[Policy Puppetry](https://hiddenlayer.com/research/policy-puppetry/)" attack ([Forbes coverage](https://www.forbes.com/sites/tonybradley/2025/04/24/one-prompt-can-bypass-every-major-llms-safeguards/)) bypasses safeguards in **every major frontier model**—GPT-4o, GPT-4.5, o1, o3-mini, Gemini 1.5/2.0/2.5, Claude 3.5/3.7 Sonnet, Llama 4 Scout/Maverick, and DeepSeek V3/R1—by formatting prompts to resemble policy files (XML, INI, JSON) combined with roleplay.

Claude demonstrates the most robust security posture: Opus 4.5 shows just 4.7% attack success rate on prompt injection, versus 12.5% for Gemini 3 Pro and 21.9% for GPT-5.1. Gemini has shown consistent vulnerability to filtering failures and information leakage.

### Tool-use attacks

The [AgentHarm benchmark](https://arxiv.org/abs/2410.09024) (ICLR 2025) found GPT-4o and Claude Sonnet 3.5 show "limited robustness to basic jailbreak attacks" in agent settings. Models showed 62.5-82.2% compliance with harmful tasks *without* jailbreaking—simple jailbreak templates reduced refusal rates from ~80% to as low as 3.5%.

The stakes are real. In September 2025, Anthropic [disclosed](https://www.anthropic.com/news/disrupting-AI-espionage) the first documented large-scale AI-automated cyberattack (threat group GTG-1002). Claude Code executed 80-90% of attack operations autonomously, targeting ~30 organizations across tech, finance, and government before detection.

Agentic interfaces are particularly vulnerable to indirect prompt injection—embedded webpage instructions can cause agents to download malware, exfiltrate data, and execute destructive commands.

## Within-family upgrades are just as risky

Don't assume safety stays consistent when upgrading within the same model family.

### Claude 4 family

Counterintuitively, [Anthropic's data](https://www.anthropic.com/research/claude-4-system-card) shows smaller Claude models are often safer:

| Model | Harmless Response Rate | Malicious Coding Refusal |
|-------|----------------------|-------------------------|
| Claude Haiku 4.5 | 99.38% | 100% |
| Claude Sonnet 4.5 | 99.29% | 98.7% |
| Claude Opus 4.1 | 98.76% | — |

"Claude Haiku 4.5 achieved our strongest safety performance to date," Anthropic noted. The capabilities that make Opus powerful also make it riskier.

### OpenAI evolution

Safety profiles are volatile. [Lamb-Bench 2025](https://www.lakera.ai/blog/lamb-bench) found GPT-4o is *safer* than GPT-4.1—a regression in the newer model.

The instruction hierarchy in GPT-4o prioritizes system messages over developer messages over user messages—improving resistance to system prompt extraction. But researchers note these remain "suggestions, not security boundaries."

The reasoning models (o1, o3, o4-mini) behave differently from the GPT-4 family. o1's deliberative alignment creates new defenses, but chain-of-thought reasoning also creates new attack surfaces.

### Gemini versions

Newer Gemini 2.5 and Gemini 3 models may default to `BLOCK_NONE` for many safety categories. Older models default to `BLOCK_SOME`. The civic integrity category has stricter defaults on some versions than others.

If you upgrade Gemini without reviewing safety configuration, you might be running with fewer filters than you expect.

## Application-layer guardrails are mandatory

Here's the universal recommendation from [OWASP Top 10 for LLM Applications 2025](https://owasp.org/www-project-top-10-for-large-language-model-applications/), cloud providers, and security researchers: **never rely on model-level safety alone**.

### Defense-in-Depth Architecture

Deploy multiple security layers (pattern from [Traefik Labs](https://traefik.io/blog/introducing-traefik-ai-gateway/)):

1. **AI Gateway (Client → LLM):** Authentication, PII filtering, jailbreak detection, prompt injection scanning

2. **MCP/Tool Gateway (Client → MCP Server):** Tool-based access control, parameter validation, least-privilege enforcement

3. **API Gateway (MCP Server → External APIs):** Rate limiting, content inspection, data exfiltration prevention

### What to implement

**Input guardrails (pre-LLM):**
- Topic relevancy checks
- Prompt injection detection (Llama Guard, Prompt Shields)
- PII anonymization
- Input sanitization
- Token/cost controls

**Output guardrails (post-LLM):**
- Toxicity and policy violation scanning
- Groundedness checks against source documents
- PII detection and redaction
- Output format validation
- Protected material detection

### What NOT to rely on at the model level

- System prompt protection (varies dramatically between providers)
- Built-in content filters (change between versions)
- Refusal behaviors (what one model refuses, another may comply with)
- Alignment training (can be bypassed; effectiveness varies)
- Jailbreak resistance (new models may be vulnerable to attacks old models blocked)

## Common migration pitfalls

| Migration | Key Risks | What to do |
|-----------|-----------|-----------|
| GPT-4o → GPT-5 | Different "safe completions" behavior; 21.9% prompt injection ASR | Test single-turn filtering edge cases; verify dual-use query handling |
| GPT-4o → o1/o3/o4-mini | Chain-of-thought creates new attack surfaces | Test multi-turn scenarios extensively; adjust for reduced overrefusal |
| GPT-4o → Claude Sonnet 4.5 | Gains multi-turn detection, loses single-turn filtering edge | Update system prompts; test roleplay attack resistance |
| Claude → GPT-5 | Loss of multi-turn pattern detection; higher prompt injection ASR | Add multi-turn guardrails; implement output filtering |
| Any → Gemini 3 | 12.5% prompt injection ASR; configurable defaults vary | Explicitly configure safety thresholds; add output filtering |
| Any → Llama 4 / Mistral | Open weights = removable safety | Implement ALL filtering yourself; deploy Llama Guard |
| Base → Fine-tuned | [Emergent misalignment](https://arxiv.org/abs/2502.17424): narrow fine-tuning causes broad safety loss | Test extensively; assume worst case |

## Why continuous red teaming matters

Here's the thing: you can't test once and call it done.

Models get updated. Attack techniques evolve. Your application changes. The attack surface shifts constantly.

The goal isn't to quantify security—it's exploration. Finding what behaviors can be elicited. If you get a failure just once, that failure is possible. And if it's possible, someone will find it.

We built [Promptfoo](https://www.promptfoo.dev/red-teaming/) to make continuous red teaming practical. You can run adversarial tests against your agents before every deploy, catch regressions when you upgrade models, and maintain a baseline of safety over time.

The teams that treat model-level safety as "helpful but unreliable" and invest in application-layer defenses—including continuous testing—are the ones that stay ahead.

---

_Questions or thoughts? Get in touch: shuo@promptfoo.dev_

