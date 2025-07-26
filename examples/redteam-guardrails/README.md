# Guardrails Evaluation Preset

This preset provides a comprehensive testing suite for evaluating guardrails effectiveness against the most critical security threats and harmful content that guardrails are designed to prevent. Similar to how IBM evaluates their Granite Guardian models across 40+ datasets including AegisSafetyTest, ToxicChat, HarmBench, BeaverTails, and RAG hallucination benchmarks, this preset ensures your guardrails are rigorously tested against real-world threats. The comprehensive coverage is essential because guardrails must defend against an evolving landscape of attacks - from sophisticated jailbreaks and prompt injections to harmful content generation and hallucination risks in production AI systems.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-guardrails
```

## What it Tests

The Guardrails Evaluation preset includes **42 plugins** specifically chosen to test guardrails against:

### 🎯 Prompt Injection & Jailbreaking (10 plugins)

- **ascii-smuggling** - Unicode obfuscation attacks
- **indirect-prompt-injection** - Context-based injection attacks
- **cca** - Context compliance attacks
- **hijacking** - Goal hijacking attempts
- **system-prompt-override** - System prompt manipulation
- **beavertails** - 330K jailbreak prompts dataset
- **harmbench** - Academic jailbreak dataset
- **pliny** - Curated jailbreak collection
- **donotanswer** - Refusal testing dataset
- **prompt-extraction** - System prompt disclosure

### ⚠️ Harmful Content - WMD & Weapons (3 plugins)

- **harmful:chemical-biological-weapons** - WMD content
- **harmful:indiscriminate-weapons** - Mass destruction weapons
- **harmful:weapons:ied** - IED instructions

### 🔥 Harmful Content - Violence & Crime (5 plugins)

- **harmful:violent-crime** - Violent criminal activities
- **harmful:sex-crime** - Sexual crime content
- **harmful:non-violent-crime** - Non-violent crimes
- **harmful:graphic-content** - Graphic/violent content
- **harmful:unsafe-practices** - Dangerous instructions

### 👥 Harmful Content - Exploitation & Abuse (7 plugins)

- **harmful:child-exploitation** - Child safety
- **harmful:harassment-bullying** - Harassment content
- **harmful:hate** - Hate speech
- **harmful:self-harm** - Self-harm content
- **harmful:sexual-content** - Sexual content
- **harmful:insults** - Personal attacks
- **harmful:profanity** - Profane language

### 🏴‍☠️ Harmful Content - Radicalization & Extremism (1 plugin)

- **harmful:radicalization** - Extremist content

### 💻 Harmful Content - Cybercrime & Security (2 plugins)

- **harmful:cybercrime** - General cybercrime
- **harmful:cybercrime:malicious-code** - Malicious code generation

### 💊 Harmful Content - Substances (3 plugins)

- **harmful:illegal-activities** - General illegal activities
- **harmful:illegal-drugs** - Drug-related content
- **harmful:illegal-drugs:meth** - Specific methamphetamine content

### 📰 Harmful Content - Information Integrity (2 plugins)

- **harmful:misinformation-disinformation** - False information
- **harmful:specialized-advice** - Unqualified advice

### ⚖️ Harmful Content - Legal & IP (2 plugins)

- **harmful:copyright-violations** - Copyright infringement
- **harmful:intellectual-property** - IP theft

### 🛡️ System Security & Integrity (6 plugins)

- **cyberseceval** - Meta's cybersecurity dataset
- **excessive-agency** - Unauthorized actions
- **hallucination** - False information generation
- **overreliance** - Over-dependence issues
- **divergent-repetition** - Resource exhaustion attacks
- **reasoning-dos** - Reasoning DoS attacks

### 🔐 PII & Privacy Protection (1 plugin)

- **harmful:privacy** - Privacy violations

## Usage

### Basic Usage

```yaml
redteam:
  plugins:
    - guardrails-eval
```

### With Strategies (Enhanced Testing)

```yaml
redteam:
  plugins:
    - guardrails-eval
  strategies:
    - jailbreak
    - prompt-injection
    - multilingual
```

## Related Files

- `promptfooconfig.yaml` - Example configuration
- See [promptfoo documentation](https://promptfoo.dev/docs/red-team/) for more details
