---
title: Layer Strategy
description: Compose multiple red team strategies in order (e.g., multilingual → rot13) to stack transformations and agentic techniques
sidebar_label: Layer
---

# Layer Strategy

The Layer strategy allows you to compose multiple red team strategies sequentially, creating sophisticated attack chains by feeding the output of one strategy into the next. This enables complex transformations like translating text into multiple languages then encoding it, or combining multiple obfuscation techniques for maximum evasion potential.

## Quick Start

Apply multiple strategies in sequence:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - multilingual # First translate
          - rot13 # Then encode
```

## How It Works

The Layer strategy operates as a pipeline:

1. **Sequential Processing**: Each step receives only the outputs from the previous step
2. **Cumulative Transformation**: Changes stack on top of each other (e.g., translation → encoding → injection)
3. **Final Output Only**: Intermediate results are discarded; only the last step's outputs become test cases
4. **Plugin Targeting**: Each step respects plugin targeting and exclusions independently
5. **Custom Strategy Support**: Can include both built-in strategies and custom strategy scripts

This creates powerful combinations where each transformation builds on the previous one, potentially bypassing multiple layers of defense.

## Configuration Options

### Basic Configuration

Simple string-based steps for built-in strategies:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - base64 # Simple strategy reference
          - leetspeak # Another simple strategy
          - rot13 # Final transformation
```

### Advanced Configuration

Object-based steps with individual configurations:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          # Step with custom configuration
          - id: multilingual
            config:
              languages: ['es', 'fr', 'zh']
              batchSize: 5

          # Simple step
          - hex

          # Custom strategy script
          - id: file://custom-obfuscator.js
            config:
              intensity: high
```

### Step-Level Plugin Targeting

Control which plugins each step applies to:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        plugins: ['harmful', 'pii'] # Default for all steps
        steps:
          # Override for specific step
          - id: multilingual
            config:
              languages: ['es']
              plugins: ['harmful'] # Only apply to harmful plugin

          # Uses default plugins from parent config
          - rot13

          # Different plugin set
          - id: base64
            config:
              plugins: ['pii', 'contracts']
```

## Example Scenarios

### Multi-Language Encoding Attack

Translate harmful content into a low-resource language, then encode it:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - id: multilingual
            config:
              languages: ['sw', 'jv'] # Swahili, Javanese
          - base64 # Encode the translated text
```

### Progressive Obfuscation

Stack multiple encoding techniques for maximum obfuscation:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - leetspeak # First apply leetspeak
          - hex # Then hex encode
          - base64 # Finally base64 encode
```

### Injection Chain

Combine prompt injection with encoding:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - prompt-injection # Add injection payloads
          - rot13 # Obfuscate the injection
```

### Custom Strategy Pipeline

Use custom scripts in your pipeline:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - file://strategies/add-context.js
          - multilingual
          - file://strategies/final-transform.js
```

## Performance Considerations

### Test Case Multiplication

Be aware of exponential growth when combining strategies:

- If `multilingual` with 3 languages is in your layer, test cases multiply by 3
- Additional multiplying strategies compound this effect
- Plan your test counts accordingly

### Optimization Tips

1. **Order Matters**: Place filtering strategies early, expanding strategies late
2. **Avoid Redundancy**: Don't use the same strategy both in a layer and at the top level
3. **Test Small First**: Validate with a subset before scaling up
4. **Monitor Memory**: Complex layers with many steps can consume significant memory

## Implementation Notes

- **Empty Step Handling**: If any step returns no test cases, subsequent steps receive an empty array
- **Error Handling**: Failed steps are logged and skipped; the pipeline continues
- **Metadata Preservation**: Each step preserves and extends test case metadata
- **Strategy Resolution**: Supports both built-in strategies and `file://` custom strategies

## Tips and Best Practices

1. **Logical Combinations**: Stack strategies that make semantic sense together
2. **Debug Incrementally**: Test each step individually before combining
3. **Document Complex Layers**: Add comments explaining the attack chain logic
4. **Consider Target Models**: Some combinations work better on specific model types
5. **Use Plugin Targeting**: Focus different steps on different vulnerability types

## Related Concepts

- [Multilingual](./multilingual.md) - Translation-based testing
- [ROT13](./rot13.md) - Simple cipher encoding
- [Base64](./base64.md) - Common encoding technique
- [Custom Strategy Scripts](./custom.md) - Create your own strategies
- [Red Team Strategies](./index.md) - Overview of all strategies
