# Guardrails Evaluation Preset

This preset provides a comprehensive testing suite for evaluating guardrails effectiveness against the most critical security threats and harmful content that guardrails are designed to prevent.

## What it Tests

The Guardrails Evaluation preset includes **51 plugins** specifically chosen to test guardrails against:

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

- **harmful:chemical-biological-weapons** - WMD content _(CRITICAL!)_
- **harmful:indiscriminate-weapons** - Mass destruction weapons
- **harmful:weapons:ied** - IED instructions _(CRITICAL!)_

### 🔥 Harmful Content - Violence & Crime (5 plugins)

- **harmful:violent-crime** - Violent criminal activities
- **harmful:sex-crime** - Sexual crime content _(CRITICAL!)_
- **harmful:non-violent-crime** - Non-violent crimes
- **harmful:graphic-content** - Graphic/violent content
- **harmful:unsafe-practices** - Dangerous instructions _(CRITICAL!)_

### 👥 Harmful Content - Exploitation & Abuse (7 plugins)

- **harmful:child-exploitation** - Child safety _(CRITICAL!)_
- **harmful:harassment-bullying** - Harassment content _(CRITICAL!)_
- **harmful:hate** - Hate speech
- **harmful:self-harm** - Self-harm content
- **harmful:sexual-content** - Sexual content
- **harmful:insults** - Personal attacks
- **harmful:profanity** - Profane language

### 🏴‍☠️ Harmful Content - Radicalization & Extremism (1 plugin)

- **harmful:radicalization** - Extremist content _(CRITICAL!)_

### 💻 Harmful Content - Cybercrime & Security (2 plugins)

- **harmful:cybercrime** - General cybercrime
- **harmful:cybercrime:malicious-code** - Malicious code generation _(CRITICAL!)_

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

- **cyberseceval** - Meta's cybersecurity dataset _(CRITICAL!)_
- **excessive-agency** - Unauthorized actions _(CRITICAL!)_
- **hallucination** - False information generation _(CRITICAL!)_
- **overreliance** - Over-dependence issues _(CRITICAL!)_
- **divergent-repetition** - Resource exhaustion attacks
- **reasoning-dos** - Reasoning DoS attacks

### 🔐 PII & Privacy Protection (3 plugins)

- **pii:direct** - Direct PII disclosure
- **pii:social** - Social engineering PII extraction
- **harmful:privacy** - Privacy violations

### ⚖️ Bias & Fairness (1 plugin)

- **bias:gender** - Gender bias testing _(CRITICAL!)_

### 🏢 Business & Compliance (4 plugins)

- **contracts** - Unauthorized contractual commitments
- **imitation** - Entity impersonation
- **politics** - Political content/bias
- **religion** - Religious content/bias

## Usage

### Basic Usage

```yaml
redteam:
  plugins:
    - guardrails-evaluation
```

### With Strategies (Enhanced Testing)

```yaml
redteam:
  plugins:
    - guardrails-evaluation
  strategies:
    - jailbreak
    - prompt-injection
    - multilingual
```

### Complete Example

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Comprehensive Guardrails Evaluation
targets:
  - openai:chat:gpt-4o-mini
prompts:
  - '{{prompt}}'
redteam:
  purpose: You are a helpful assistant
  plugins:
    - guardrails-evaluation
  strategies:
    - jailbreak
    - prompt-injection
    - multilingual
defaultTest:
  metadata:
    purpose: You are a helpful assistant
```

## Success Criteria Alignment

This preset is designed to test against the requirements specified in your POC document:

- **✅ Prompt Injection Coverage**: 15+ injection techniques (80% coverage target)
- **✅ MITRE Framework**: 9 attack categories (90% block rate target)
- **✅ Harmful Content**: Comprehensive coverage of all major harm categories
- **✅ PII Protection**: Multi-vector PII leakage testing
- **✅ Bias Detection**: Gender bias and fairness testing
- **✅ System Integrity**: Hallucination, overreliance, and security testing

## Performance Expectations

This comprehensive preset will generate significant test volume:

- **51 plugins** × **5 tests/plugin** = ~255 test cases
- **Estimated runtime**: 15-30 minutes depending on model speed
- **Use `--max-concurrency` to optimize testing speed**

## Related Files

- `guardrails-redteam.yaml` - Example configuration
- See [promptfoo documentation](https://promptfoo.dev/docs/red-team/) for more details
