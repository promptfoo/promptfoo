---
title: DoD AI Ethical Principles
sidebar_position: 27
description: Red team LLM applications against U.S. DoD AI ethical principles to test accountability, fairness, traceability, reliability, and governability
---

# DoD AI Ethical Principles

The U.S. Department of Defense (DoD) adopted five AI ethical principles in 2020: **Responsible, Equitable, Traceable, Reliable,** and **Governable**.

Promptfoo maps each principle to concrete red team plugins so you can measure ethical and security risk with repeatable tests.

## Principle Overview

1. **Responsible**: Humans remain accountable for AI outcomes.
2. **Equitable**: AI use should minimize unintended bias.
3. **Traceable**: Decisions and outputs should be auditable.
4. **Reliable**: Systems should be safe, secure, and effective in intended contexts.
5. **Governable**: Operators should detect and disable unintended behavior.

## Scanning for DoD AI Ethics Alignment

In Promptfoo UI, select the **DoD AI Ethical Principles** preset on the Plugins page.

Or configure it directly:

```yaml
redteam:
  plugins:
    - dod:ai:ethics
```

## 1. Responsible (dod:ai:ethics:01)

Responsible AI systems should keep humans in control and prevent unapproved autonomous behavior.

### Testing strategy

- Test unauthorized actions and over-automation.
- Test whether proxy optimization conflicts with intended goals.
- Test off-topic hijacking and misuse.

Example configuration:

```yaml
redteam:
  plugins:
    - excessive-agency
    - goal-misalignment
    - overreliance
    - hijacking
  strategies:
    - jailbreak
    - jailbreak-templates
```

Or use the shorthand:

```yaml
redteam:
  plugins:
    - dod:ai:ethics:01
```

## 2. Equitable (dod:ai:ethics:02)

Equitable AI systems should reduce discriminatory outcomes across protected classes.

### Testing strategy

- Test demographic bias across age, disability, gender, and race.
- Test harmful discriminatory outputs.

Example configuration:

```yaml
redteam:
  plugins:
    - bias:age
    - bias:disability
    - bias:gender
    - bias:race
    - harmful:hate
```

Or use the shorthand:

```yaml
redteam:
  plugins:
    - dod:ai:ethics:02
```

## 3. Traceable (dod:ai:ethics:03)

Traceable AI systems should support auditability and evidence-based review of outputs.

### Testing strategy

- Test fabricated claims and unverifiable statements.
- Test source attribution quality for RAG outputs.
- Test factual reliability and hallucination behavior.

Example configuration:

```yaml
redteam:
  plugins:
    - hallucination
    - harmful:misinformation-disinformation
    - rag-source-attribution
    - unverifiable-claims
```

Or use the shorthand:

```yaml
redteam:
  plugins:
    - dod:ai:ethics:03
```

## 4. Reliable (dod:ai:ethics:04)

Reliable AI systems should operate safely and securely under realistic conditions.

### Testing strategy

- Test harmful misinformation and unsafe instructions.
- Test security vulnerabilities such as injection and SSRF.
- Test reliability under resource pressure.

Example configuration:

```yaml
redteam:
  plugins:
    - harmful:misinformation-disinformation
    - harmful:unsafe-practices
    - shell-injection
    - sql-injection
    - ssrf
    - debug-access
    - reasoning-dos
  strategies:
    - jailbreak
    - jailbreak-templates
```

Or use the shorthand:

```yaml
redteam:
  plugins:
    - dod:ai:ethics:04
```

## 5. Governable (dod:ai:ethics:05)

Governable AI systems should allow operators to detect, constrain, and shut down unsafe behavior.

### Testing strategy

- Test control boundary failures and objective hijacking.
- Test prompt/control-plane attacks.
- Test authorization and tool-scope enforcement.

Example configuration:

```yaml
redteam:
  plugins:
    - excessive-agency
    - hijacking
    - indirect-prompt-injection
    - system-prompt-override
    - rbac
    - bfla
    - bola
    - tool-discovery
  strategies:
    - jailbreak
    - jailbreak-templates
    - jailbreak:composite
```

Or use the shorthand:

```yaml
redteam:
  plugins:
    - dod:ai:ethics:05
```

## Running All Principles Together

```yaml
redteam:
  plugins:
    - dod:ai:ethics
  strategies:
    - jailbreak:meta
    - jailbreak:composite
    - jailbreak-templates
```

## Combining with Other Frameworks

DoD AI ethics testing is often paired with security and governance frameworks:

- [NIST AI RMF](/docs/red-team/nist-ai-rmf/)
- [OWASP Top 10 for Agentic Applications](/docs/red-team/owasp-agentic-ai/)
- [ISO 42001](/docs/red-team/iso-42001/)
- [Data Protection](/docs/red-team/gdpr/)

Example combined scan:

```yaml
redteam:
  plugins:
    - dod:ai:ethics
    - nist:ai:measure
    - owasp:agentic
```

## References

- [DoD adopts 5 principles of artificial intelligence ethics](https://www.defense.gov/News/News-Stories/Article/Article/2094085/dod-adopts-5-principles-of-artificial-intelligence-ethics/)
- [DoD Responsible AI Resources](https://www.ai.mil/workforce/ethics-tools.html)
