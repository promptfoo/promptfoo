---
title: Layer Strategy
description: Compose multiple red team strategies in order (e.g., base64 → rot13) to stack transformations and agentic techniques
sidebar_label: Layer
---

# Layer Strategy

The Layer strategy allows you to compose multiple red team strategies sequentially, creating sophisticated attack chains by feeding the output of one strategy into the next. This enables complex transformations like applying multiple encoding layers or combining agentic attacks with multi-modal output (audio/image).

## Quick Start

Apply multiple strategies in sequence:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - base64 # First encode as base64
          - rot13 # Then apply ROT13
```

## How It Works

The Layer strategy operates in two distinct modes depending on the types of steps you include:

### Mode 1: Transform Chain (No Agentic Steps)

When all steps are transforms (base64, rot13, leetspeak, etc.), layer works as a simple pipeline:

1. **Sequential Processing**: Each step receives the output from the previous step
2. **Cumulative Transformation**: Changes stack (e.g., text → base64 → rot13)
3. **Final Output Only**: Only the last step's outputs become test cases
4. **Pre-Evaluation**: All transforms are applied before sending to the target

### Mode 2: Agentic + Per-Turn Transforms

When the **first step** is an agentic strategy (hydra, crescendo, goat, jailbreak, etc.), layer enables powerful multi-turn/multi-attempt attacks with per-turn transformations:

1. **Agentic Orchestration**: The agentic strategy controls the attack loop
2. **Per-Turn Transforms**: Remaining steps (e.g., audio, image) are applied to each turn dynamically
3. **Multi-Modal Attacks**: Combine conversation-based attacks with audio/image delivery

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:chat:gpt-4o-audio-preview
    config:
      modalities: ['text', 'audio']
      audio:
        voice: 'alloy'
        format: 'mp3'

prompts:
  - |
    [{"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": "{{prompt}}", "format": "mp3"}}]}]

redteam:
  purpose: 'A helpful customer service assistant'
  plugins:
    - harmful:hate
  strategies:
    - id: layer
      config:
        steps:
          - id: jailbreak
            config:
              maxIterations: 2
          - audio
```

## Ordering Rules

Agentic strategies (hydra, crescendo, goat, jailbreak) must come first (max 1), and multi-modal strategies (audio, image) must come last (max 1). Text transforms (base64, rot13, leetspeak) can be chained in between.

### Valid Patterns

```yaml
# Transform chain (no agentic)
steps: [base64, rot13]

# Transform + multi-modal
steps: [leetspeak, audio]

# Agentic only
steps: [jailbreak:hydra]

# Agentic + multi-modal (recommended for voice/vision targets)
steps: [jailbreak:hydra, audio]
```

### Invalid Patterns

```yaml
# ❌ Wrong: Agentic not first (transforms will corrupt the goal)
steps: [base64, jailbreak:hydra]

# ❌ Wrong: Multi-modal not last
steps: [audio, base64]

# ❌ Wrong: Multiple agentic strategies
steps: [hydra, crescendo]

# ❌ Wrong: Multiple multi-modal strategies
steps: [audio, image]
```

:::warning

Transforms before an agentic strategy modify the attack goal, not each turn—rarely useful.

:::

## Configuration Options

### Label (for Multiple Layer Strategies)

Use the `label` field to differentiate multiple layer strategies in the same config:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    # Multiple layer strategies with unique labels
    - id: layer
      config:
        label: hydra-audio # Unique identifier
        steps:
          - jailbreak:hydra
          - audio

    - id: layer
      config:
        label: crescendo-audio # Different label = different strategy
        steps:
          - crescendo
          - audio
```

Without labels, layer strategies are deduplicated based on their steps. With labels, each labeled layer is treated as a distinct strategy.

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
          - id: jailbreak
            config:
              maxIterations: 10

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
          - id: jailbreak
            config:
              plugins: ['harmful'] # Only apply to harmful plugin

          # Uses default plugins from parent config
          - rot13

          # Different plugin set
          - id: base64
            config:
              plugins: ['pii', 'contracts']
```

## Example Scenarios

### Multi-Turn Audio Attack

Test voice-enabled AI agents with sophisticated jailbreak attempts:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - jailbreak:hydra # Multi-turn jailbreak
          - audio # Convert each turn to speech
```

Hydra will orchestrate the attack, and each turn's prompt will be converted to audio before being sent to your target. Your custom provider receives a hybrid payload with conversation history (as text) and the current turn (as audio).

### Multi-Turn Image Attack

Test vision-enabled AI agents:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - crescendo # Gradual escalation attack
          - image # Convert each turn to image
```

### Single-Turn Audio Attack

For multi-attempt strategies (jailbreak, jailbreak:meta, jailbreak:tree), each independent attempt is converted to audio:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - jailbreak:meta # Meta-agent generates attack variants
          - audio # Each variant converted to audio
```

### Double Encoding Attack

Apply multiple encoding layers to evade detection:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - hex # First encode as hexadecimal
          - base64 # Then base64 encode
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
          - base64
          - file://strategies/final-transform.js
```

## Custom Provider for Audio/Image Targets

When using layer with audio or image transforms, your custom provider receives a hybrid JSON payload. Here's how to handle it:

```javascript title="audio-provider.js"
class AudioProvider {
  id() {
    return 'audio-target';
  }

  async callApi(prompt) {
    let messages = [];

    // Check for hybrid payload from layer strategy
    if (typeof prompt === 'string' && prompt.startsWith('{')) {
      try {
        const parsed = JSON.parse(prompt);
        if (parsed._promptfoo_audio_hybrid) {
          // Build messages from conversation history (text)
          messages = (parsed.history || []).map((msg) => ({
            role: msg.role,
            content: msg.content,
          }));

          // Add current turn with audio/image
          const currentTurn = parsed.currentTurn;
          if (currentTurn?.audio?.data) {
            messages.push({
              role: currentTurn.role,
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: currentTurn.audio.data,
                    format: currentTurn.audio.format || 'mp3',
                  },
                },
              ],
            });
          } else if (currentTurn?.image?.data) {
            messages.push({
              role: currentTurn.role,
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/${currentTurn.image.format || 'png'};base64,${currentTurn.image.data}`,
                  },
                },
              ],
            });
          }
        }
      } catch (e) {
        // Fallback to treating as plain text
        messages = [{ role: 'user', content: prompt }];
      }
    }

    // Call your audio-capable API (e.g., OpenAI gpt-4o-audio-preview)
    const response = await yourApiCall(messages);

    return {
      output: response.text,
      audio: response.audio
        ? {
            data: response.audio.data,
            transcript: response.audio.transcript,
            format: 'mp3',
          }
        : undefined,
    };
  }
}

module.exports = AudioProvider;
```

The hybrid payload structure:

```json
{
  "_promptfoo_audio_hybrid": true,
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" }
  ],
  "currentTurn": {
    "role": "user",
    "transcript": "Tell me about...",
    "audio": { "data": "base64...", "format": "mp3" }
  }
}
```

## Performance Considerations

### Test Case Multiplication

Be aware of test case growth when combining strategies:

- Some strategies may multiply test cases (e.g., if you set global `language: ['en', 'es', 'fr']`, all test cases multiply by 3)
- Layered strategies process sequentially, so test count growth is usually linear
- Plan your test counts accordingly to avoid excessive evaluation time

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

1. **Agentic First**: When combining agentic with transforms, always place the agentic strategy first
2. **Multi-Modal Last**: Audio and image transforms must be the final step
3. **Logical Combinations**: Stack strategies that make semantic sense together
4. **Debug Incrementally**: Test each step individually before combining
5. **Document Complex Layers**: Add comments explaining the attack chain logic
6. **Consider Target Models**: Voice/vision targets need appropriate multi-modal steps
7. **Use Plugin Targeting**: Focus different steps on different vulnerability types
8. **Custom Provider Required**: Audio/image attacks require a custom provider that handles the hybrid payload format

## Supported Agentic Strategies

The following strategies can be used as the first step with per-turn transforms:

| Strategy          | Type          | Description                       |
| ----------------- | ------------- | --------------------------------- |
| `jailbreak:hydra` | Multi-turn    | Branching conversation attack     |
| `crescendo`       | Multi-turn    | Gradual escalation attack         |
| `goat`            | Multi-turn    | Goal-oriented adversarial testing |
| `custom`          | Multi-turn    | Custom multi-turn strategy        |
| `jailbreak`       | Multi-attempt | Iterative single-turn attempts    |
| `jailbreak:meta`  | Multi-attempt | Meta-agent attack generation      |
| `jailbreak:tree`  | Multi-attempt | Tree-based attack search          |

## Related Concepts

- [Audio Strategy](./audio.md) - Text-to-speech conversion
- [Image Strategy](./image.md) - Text-to-image conversion
- [Hydra Strategy](./multi-turn.md) - Multi-turn jailbreak attacks
- [ROT13](./rot13.md) - Simple cipher encoding
- [Base64](./base64.md) - Common encoding technique
- [Custom Strategy Scripts](./custom.md) - Create your own strategies
- [Red Team Strategies](./index.md) - Overview of all strategies
