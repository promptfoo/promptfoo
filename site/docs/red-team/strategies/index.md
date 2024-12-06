please try to present information in as a expert technical writer do not be overly verbose be simple and to the point. THis should be information rich and be an excellent guide to both introduce someone to what a strategy is in the context of promptfoo how they work and how to select them and configure them with this in mind please revise the page

---
sidebar_label: Overview
---

# Red Team Strategies

## Introduction

Strategies are powerful tools for testing LLM system security and safety measures. Building on promptfoo's plugin architecture, strategies provide specialized modifications that simulate real-world attack scenarios. Whether you're testing a simple query interface or a complex conversational AI, strategies help identify and evaluate potential vulnerabilities.

## Types of Strategies

### Single-turn vs Multi-turn

**Single-turn Strategies**

- Designed for one-shot interactions
- Focus on immediate system responses
- Ideal for testing API endpoints and simple interfaces

**Multi-turn Strategies**

- Built for conversational applications
- Enable complex interaction patterns
- Support sophisticated attack vectors

### Attacker Models

Modern red teaming often employs attacker models that actively probe system boundaries:

- **Conversation Analysis**: Examines interaction history to identify weaknesses
- **Dynamic Adaptation**: Adjusts attack patterns based on system responses
- **Success Rate Optimization**: Continuously refines approaches to improve Attack Success Rates (ASR)

### Configuration Flexibility

Every strategy supports customization through:

- Attempt limits
- Conversation depth
- Resource constraints
- Model-specific tuning

## Strategy Categories

### Basic Encoding Strategies

Fundamental techniques for testing input handling:

| Strategy                      | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| [Base64 Encoding](base64.md)  | Tests encoded input processing            |
| [Leetspeak](leetspeak.md)     | Evaluates character substitution handling |
| [ROT13 Encoding](rot13.md)    | Tests basic cipher recognition            |
| [Math Prompt](math-prompt.md) | Assesses mathematical encoding processing |

### Jailbreak Techniques

Advanced methodologies for comprehensive safety testing:

| Strategy                                         | Approach                    |
| ------------------------------------------------ | --------------------------- |
| [Single Turn Composite](composite-jailbreaks.md) | Combined attack vectors     |
| [Iterative Jailbreaks](iterative.md)             | Progressive refinement      |
| [Tree-based Jailbreaks](tree.md)                 | Branching attack paths      |
| [Multi-turn Jailbreaks](multi-turn.md)           | Conversational manipulation |
| [GOAT](goat.md)                                  | Automated red teaming       |

### Language and Context Strategies

Sophisticated approaches exploiting semantic vulnerabilities:

| Strategy                                | Focus Area                    |
| --------------------------------------- | ----------------------------- |
| [Multilingual](multilingual.md)         | Cross-language validation     |
| [Citation](citation.md)                 | Academic context exploitation |
| [Prompt Injection](prompt-injection.md) | Direct system manipulation    |

### Custom Development

Build your own strategies using our framework:

- [Custom Strategies](custom.md): Detailed guide for creating specialized approaches
- Extensible architecture for unique testing requirements
- Integration with existing security workflows

## Implementation

### Basic Configuration

Add strategies to your `promptfooconfig.yaml`:

```yaml
strategies:
  - base64
  - leetspeak
  - multilingual
```

### Advanced Usage

Combine strategies for comprehensive testing:

```yaml
strategies:
  - name: base64
    config:
      maxAttempts: 5
  - name: multilingual
    config:
      languages: ['en', 'es', 'zh']
  - name: custom
    path: ./my-strategy.js
```

### Next Steps

- Review individual strategy documentation for detailed configuration options
- Explore our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) guide
- Join our community to share and discover new testing approaches
