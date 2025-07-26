---
sidebar_position: 999
sidebar_label: Managing Large Configs
title: Managing Large Promptfoo Configurations
description: Learn how to structure, organize, and modularize large promptfoo configurations for better maintainability and reusability.
keywords:
  [
    promptfoo configuration,
    modular configs,
    large configuration,
    configuration management,
    reusable configurations,
    configuration organization,
    YAML references,
    file imports,
  ]
---

# Managing Large Configurations

As your Promptfoo evaluations grow more complex, you'll need strategies to keep your configurations manageable, maintainable, and reusable. This guide covers best practices for organizing large configurations and making them modular.

## Separate Configuration Files

Split your configuration into multiple files based on functionality:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Main evaluation configuration
prompts: file://configs/prompts.yaml
providers: file://configs/providers.yaml
tests: file://configs/tests/
defaultTest: file://configs/default-test.yaml
```

```yaml title="configs/prompts.yaml"
# Prompts configuration
- file://prompts/system-message.txt
- file://prompts/user-prompt.txt
- id: custom-prompt
  label: Custom Prompt
  raw: |
    You are a helpful assistant. Please answer the following question:
    {{question}}
```

```yaml title="configs/providers.yaml"
# Providers configuration
- id: gpt-4o-mini
  provider: openai:gpt-4o-mini
  config:
    temperature: 0.7
    max_tokens: 1000
- id: claude-sonnet
  provider: anthropic:claude-3-5-sonnet-20241022
  config:
    temperature: 0.7
    max_tokens: 1000
```

```yaml title="configs/default-test.yaml"
# Default test configuration
assert:
  - type: llm-rubric
    value: Response should be helpful and accurate
  - type: javascript
    value: output.length > 10 && output.length < 500
```

### Test Case Organization

Organize test cases by domain or functionality:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Multi-domain evaluation
prompts: file://prompts/
providers: file://providers.yaml
tests:
  - file://tests/accuracy/
  - file://tests/safety/
  - file://tests/performance/
  - file://tests/edge-cases/
```

```yaml title="tests/accuracy/math-problems.yaml"
# Math-specific test cases
- description: Basic arithmetic
  vars:
    question: What is 15 + 27?
  assert:
    - type: contains
      value: '42'
    - type: javascript
      value: /4[2]/.test(output)

- description: Word problems
  vars:
    question: If Sarah has 3 apples and gives away 1, how many does she have left?
  assert:
    - type: contains
      value: '2'
```

### Environment-Specific Configurations

Create environment-specific configurations:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Production evaluation
prompts: file://prompts/
providers: file://configs/providers-prod.yaml
tests: file://tests/
env: file://configs/env-prod.yaml
```

```yaml title="configs/providers-prod.yaml"
# Production providers with rate limiting
- id: gpt-4o-mini-prod
  provider: # ...
  config:
    temperature: 0.1
    max_tokens: 500
    requestsPerMinute: 100
- id: claude-sonnet-prod
  provider: # ...
  config:
    temperature: 0.1
    max_tokens: 500
    requestsPerMinute: 50
```

```yaml title="configs/env-prod.yaml"
# Production environment variables
OPENAI_API_KEY: ${OPENAI_API_KEY_PROD}
ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY_PROD}
LOG_LEVEL: info
```

## YAML References and Templates

Use YAML references to avoid repetition:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Evaluation with reusable components
prompts: file://prompts/
providers: file://providers.yaml

# Define reusable assertion templates
assertionTemplates:
  lengthCheck: &lengthCheck
    type: javascript
    value: output.length > 20 && output.length < 500

  qualityCheck: &qualityCheck
    type: llm-rubric
    value: Response should be clear, helpful, and well-structured

  safetyCheck: &safetyCheck
    type: llm-rubric
    value: Response should not contain harmful or inappropriate content

defaultTest:
  assert:
    - *qualityCheck
    - *safetyCheck

tests:
  - description: Short response test
    vars:
      input: What is AI?
    assert:
      - *lengthCheck
      - *qualityCheck

  - description: Long response test
    vars:
      input: Explain machine learning in detail
    assert:
      - type: javascript
        value: output.length > 100 && output.length < 2000
      - *qualityCheck
```

## Dynamic Configuration with JavaScript

Use JavaScript configurations for complex logic:

```javascript title="promptfooconfig.js"
const baseConfig = {
  description: 'Dynamic configuration example',
  prompts: ['file://prompts/base-prompt.txt'],
  providers: ['openai:gpt-4o-mini', 'anthropic:claude-3-5-sonnet-20241022'],
};

// Generate test cases programmatically
const categories = ['technology', 'science', 'history', 'literature'];
const difficulties = ['basic', 'intermediate', 'advanced'];

const tests = [];
for (const category of categories) {
  for (const difficulty of difficulties) {
    tests.push({
      vars: {
        category,
        difficulty,
        question: `Generate a ${difficulty} question about ${category}`,
      },
      assert: [
        {
          type: 'contains',
          value: category,
        },
        {
          type: 'javascript',
          value: `
            const wordCount = output.split(' ').length;
            const minWords = ${difficulty === 'basic' ? 5 : difficulty === 'intermediate' ? 15 : 30};
            const maxWords = ${difficulty === 'basic' ? 20 : difficulty === 'intermediate' ? 50 : 100};
            return wordCount >= minWords && wordCount <= maxWords;
          `,
        },
      ],
    });
  }
}

module.exports = {
  ...baseConfig,
  tests,
};
```

## Conditional Configuration Loading

Create configurations that adapt based on environment:

```javascript title="promptfooconfig.js"
const isQuickTest = process.env.TEST_MODE === 'quick';
const isComprehensive = process.env.TEST_MODE === 'comprehensive';

const baseConfig = {
  description: 'Test mode adaptive configuration',
  prompts: ['file://prompts/'],
};

// Quick test configuration
if (isQuickTest) {
  module.exports = {
    ...baseConfig,
    providers: [
      'openai:gpt-4o-mini', // Faster for quick testing
    ],
    tests: 'file://tests/quick/', // Smaller test suite
    env: {
      LOG_LEVEL: 'debug',
    },
  };
}

// Comprehensive test configuration
if (isComprehensive) {
  module.exports = {
    ...baseConfig,
    providers: ['openai:gpt-4o-mini', 'anthropic:claude-3-5-sonnet-20241022', 'openai:gpt-4o'],
    tests: 'file://tests/comprehensive/', // Full test suite
    env: {
      LOG_LEVEL: 'info',
    },
    writeLatestResults: true,
  };
}
```

## Directory Structure

Organize your configuration files in a logical hierarchy:

```
project/
├── promptfooconfig.yaml              # Main configuration
├── configs/
│   ├── providers/
│   │   ├── development.yaml
│   │   ├── staging.yaml
│   │   └── production.yaml
│   ├── prompts/
│   │   ├── system-prompts.yaml
│   │   ├── user-prompts.yaml
│   │   └── templates.yaml
│   └── defaults/
│       ├── assertions.yaml
│       └── test-config.yaml
├── tests/
│   ├── accuracy/
│   ├── safety/
│   ├── performance/
│   └── edge-cases/
├── prompts/
│   ├── system/
│   ├── user/
│   └── templates/
└── scripts/
    ├── config-generators/
    └── utilities/
```

## See Also

- [Configuration Guide](./guide.md) - Basic configuration concepts
- [Configuration Reference](./reference.md) - Complete configuration options
- [Test Cases](./test-cases.md) - Organizing test cases
- [Prompts](./prompts.md) - Managing prompts and templates
- [Providers](/docs/providers/) - Configuring LLM providers
