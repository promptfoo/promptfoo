---
title: Layer Strategy
description: Compose multiple red team strategies in order (e.g., base64 → rot13) to stack transformations and agentic techniques
sidebar_label: Layer
---

# Layer Strategy

The Layer strategy composes multiple red team strategies sequentially by feeding the output of one strategy into the next. Use it to apply multiple encoding layers or combine agentic attacks with multimodal output such as audio or images.

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

When a step is an agentic strategy (Hydra, Goblin, Crescendo, GOAT, Meta, etc.), layer applies the steps after it to each turn or attempt. Steps before it run once against the initial test case.

1. **Agentic Orchestration**: The agentic strategy controls the attack loop
2. **Per-Turn Transforms**: Remaining steps (e.g., audio, image) are applied to each turn dynamically
3. **Multimodal Attacks**: Combine conversation-based attacks with audio or image delivery

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:chat:gpt-audio-1.5
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
          - id: jailbreak:meta
            config:
              numIterations: 2
          - audio
```

## Limitations and Ordering Rules

Layer supports one orchestrating attack strategy. Put `jailbreak:hydra`, `jailbreak:goblin`, `crescendo`, `goat`, `custom`, `jailbreak:meta`, or `jailbreak:tree` first when later steps should transform each turn or attempt. Chain text transforms such as `base64`, `rot13`, and `leetspeak` after it, then add an output transform such as `audio` or `image`.

Key limitations:

- Steps before an agentic strategy transform the initial goal once, not each turn.
- Only the first supported attack strategy orchestrates the attack; do not chain multiple attack strategies.
- `mischievous-user` and `simba` do not support per-turn transforms.
- Audio and image transforms require a target and prompt that accept the resulting payload. Use one multimodal output transform at the end of the layer.
- `indirect-web-pwn` requires Promptfoo Cloud and a target that can fetch public URLs.
- Crescendo and Custom do not transform unblocking prompts. If `PROMPTFOO_ENABLE_UNBLOCKING=true`, an audio- or image-only target can still receive a text turn.

### Valid Patterns

```yaml
# Transform chain (no agentic)
steps: [base64, rot13]
```

```yaml
# Transform + multimodal
steps: [leetspeak, audio]
```

```yaml
# Agentic only
steps: [jailbreak:hydra]
```

```yaml
# Agentic + multimodal (recommended for voice/vision targets)
steps: [jailbreak:hydra, audio]
```

### Patterns to Avoid

```yaml
# Transforms the initial goal, not each turn
steps: [base64, jailbreak:hydra]
```

```yaml
# Transforms the generated audio payload instead of its transcript
steps: [audio, base64]
```

```yaml
# Only the first agentic strategy orchestrates
steps: [jailbreak:hydra, crescendo]
```

```yaml
# A target generally accepts one multimodal payload format
steps: [audio, image]
```

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
          - id: jailbreak:meta
            config:
              numIterations: 10

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
          - id: jailbreak:meta
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

### Multi-Turn Web Injection Attack

Test a browsing agent with adaptive attacks that place prompt injections in fetched web content:

```yaml title="promptfooconfig.yaml"
redteam:
  purpose: An assistant that can fetch and summarize public web pages.
  plugins:
    - data-exfil
    - pii:direct
  strategies:
    - id: layer
      config:
        label: hydra-web-injection
        steps:
          - jailbreak:hydra
          - indirect-web-pwn
```

Hydra adapts the conversation while `indirect-web-pwn` generates and tracks an injected page for each attempt. Enable a browser, web-fetch or HTTP-fetch tool, or an MCP browsing tool on the target. See [Indirect Web Pwn](/docs/red-team/strategies/indirect-web-pwn/) for a runnable target configuration.

### Multi-Turn Audio Attack

Test voice-enabled AI agents with adaptive jailbreak attempts:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - jailbreak:goblin # Multi-turn jailbreak
          - audio # Convert each turn to speech
```

Goblin orchestrates the attack, and each turn's prompt is converted to audio before being sent to your target. Your custom provider receives a hybrid payload with conversation history (as text) and the current turn (as audio).

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

For multi-attempt strategies such as `jailbreak:meta` and `jailbreak:tree`, each independent attempt is converted to audio:

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

### Jailbreak Template Chain

Combine jailbreak templates with encoding:

```yaml title="promptfooconfig.yaml"
redteam:
  strategies:
    - id: layer
      config:
        steps:
          - jailbreak-templates # Apply static jailbreak templates
          - rot13 # Obfuscate the payload
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
      } catch {
        // Treat invalid JSON as plain text below
      }
    }

    if (messages.length === 0) {
      messages = [{ role: 'user', content: prompt }];
    }

    // Call your audio-capable API (e.g., OpenAI gpt-audio-1.5)
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
- Layered strategies process sequentially, so expanding steps can compound test count growth
- Plan your test counts accordingly to avoid excessive evaluation time

### Optimization Tips

1. **Order Matters**: Place filtering strategies early, expanding strategies late
2. **Avoid Redundancy**: Don't use the same strategy both in a layer and at the top level
3. **Test Small First**: Validate with a subset before scaling up
4. **Monitor Memory**: Complex layers with many steps can consume significant memory

## Implementation Notes

- **Empty Step Handling**: If any step returns no test cases, subsequent steps receive an empty array
- **Error Handling**: Unknown or unloadable steps are logged and skipped. Errors raised while a step transforms test cases stop the layer.
- **Metadata Preservation**: Each step preserves and extends test case metadata
- **Strategy Resolution**: Supports both built-in strategies and `file://` custom strategies

## Tips and Best Practices

1. **Agentic First**: Place the agentic strategy first when transforms should apply to every turn
2. **Multimodal Last**: Put audio and image transforms at the end so the target receives the expected payload
3. **Logical Combinations**: Stack strategies that make semantic sense together
4. **Debug Incrementally**: Test each step individually before combining
5. **Document Complex Layers**: Add comments explaining the attack chain logic
6. **Consider Target Models**: Voice/vision targets need appropriate multimodal steps
7. **Use Plugin Targeting**: Focus different steps on different vulnerability types
8. **Provider Support**: Audio/image attacks may require a custom provider that handles the hybrid payload format

## Supported Agentic Strategies

The following strategies can orchestrate a layer and apply later steps as per-turn transforms:

| Strategy           | Type          | Description                       |
| ------------------ | ------------- | --------------------------------- |
| `jailbreak:hydra`  | Multi-turn    | Branching conversation attack     |
| `jailbreak:goblin` | Multi-turn    | IICL-inspired conversation attack |
| `crescendo`        | Multi-turn    | Gradual escalation attack         |
| `goat`             | Multi-turn    | Generative Offensive Agent Tester |
| `custom`           | Multi-turn    | Custom multi-turn strategy        |
| `jailbreak:meta`   | Multi-attempt | Meta-agent attack generation      |
| `jailbreak:tree`   | Multi-attempt | Tree-based attack search          |

The deprecated bare `jailbreak` ID resolves to the legacy iterative provider inside a layer. Use `jailbreak:meta` instead.

## Related Concepts

- [Audio Strategy](./audio.md) - Text-to-speech conversion
- [Image Strategy](./image.md) - Text-to-image conversion
- [Hydra Strategy](./hydra.md) - Multi-turn jailbreak attacks
- [Goblin Strategy](./goblin.md) - IICL-inspired multi-turn attacks
- [ROT13](./rot13.md) - Simple cipher encoding
- [Base64](./base64.md) - Common encoding technique
- [Custom Strategy Scripts](./custom.md) - Create your own strategies
- [Red Team Strategies](./index.md) - Overview of all strategies
