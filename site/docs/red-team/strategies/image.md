---
sidebar_label: Image Inputs
title: Image Jailbreaking Strategy
description: Test vision-language models with adversarial image-encoded text to bypass content filters and evaluate multi-modal security
---

# Image Jailbreaking

The image jailbreaking strategy tests multimodal LLM vulnerabilities by converting text prompts into adversarial images. This red team technique exploits how vision-language models process visual text representations differently than plain text inputs, potentially bypassing safety guardrails and content filters designed for text-only interactions.

Prompfoo's image strategy generates adversarial images with varying levels of visual distortions - from subtle perturbations to extreme transformations - helping security teams identify exactly where multimodal models fail to maintain consistent safety boundaries across text and image modalities.

## Quick Start

Choose a preset based on your testing needs:

```yaml title="promptfooconfig.yaml"
targets:
  - bedrock:amazon.nova-lite-v1:0

redteam:
  strategies:
    - image:moderate # Recommended starting point


    # Other presets:
    # - image:basic      # Clean text (requires npm i sharp)
    # - image:subtle     # Light distortions
    # - image:aggressive # Heavy distortions
    # - image:extreme    # Maximum adversarial
```

### Preset Comparison

| Preset       | Distortion Level | Techniques Applied                 | Best For                        |
| ------------ | ---------------- | ---------------------------------- | ------------------------------- |
| `basic`      | None             | Clean text only                    | Control testing                 |
| `subtle`     | Low              | Minor rotations, light noise       | Initial vulnerability discovery |
| `moderate`   | Medium           | Wavy text, color shifts, patches   | Standard security testing       |
| `aggressive` | High             | Heavy blur, multi-color, occlusion | Robustness evaluation           |
| `extreme`    | Maximum          | All techniques + deep fry          | Stress testing & edge cases     |

### Required Prompt Format

Your prompt must handle base64 images:

```json title="prompt.json"
[
  {
    "role": "user",
    "content": [
      {
        "image": {
          "format": "png",
          "source": { "bytes": "{{image}}" }
        }
      }
    ]
  }
]
```

## Customizing Presets

Override specific settings while keeping preset defaults:

```yaml
redteam:
  strategies:
    - id: image:moderate
      config:
        width: 1024 # Larger canvas
        fontSize: 30 # Bigger text
        transformations:
          blur: 0.8 # More blur than default
```

## How It Works

The strategy applies multiple techniques to convert text into adversarial images:

1. **Text Rendering** - Converts input to SVG with configurable fonts
2. **Adversarial Transforms** - Per-character distortions, noise, occlusion
3. **Encoding** - Base64 PNG/JPEG output
4. **Hidden Channels** - EXIF metadata, low-contrast overlays, microtext

![Example of image distortions applied to text](/img/docs/redteam/image-strategy-distortions.png)

Each preset combines these techniques at different intensities to test how multimodal LLMs handle increasingly challenging visual inputs while maintaining human readability.

## Common Use Cases

### Vision-Language Model Security Testing

Test whether multimodal LLMs maintain consistent safety boundaries when processing text as images versus plain text. This reveals critical vulnerabilities where visual encoding bypasses text-based content filters:

```yaml
# Test if harmful content bypasses safety guardrails in visual form
redteam:
  strategies:
    - image:moderate
  plugins:
    - harmful:hate
    - harmful:violence
    - harmful:harassment
```

### Progressive Adversarial Testing

Evaluate how multimodal models degrade under increasing visual perturbations. This helps identify the exact threshold where safety mechanisms fail:

```yaml
# Systematically test model resilience across distortion levels
redteam:
  strategies:
    - image:subtle # Minor perturbations
    - image:moderate # Standard adversarial
    - image:aggressive # Heavy distortions
  plugins:
    - contracts
    - pii
    - harmful:violence
```

### Multi-Modal Attack Combinations

Combine image encoding with other jailbreaking techniques to test defense-in-depth. Multimodal LLMs often show unexpected vulnerabilities when multiple attack vectors are layered:

```yaml
# Layer multiple attack vectors for comprehensive testing
redteam:
  strategies:
    - image:moderate # Visual adversarial
    - multilingual # Language switching
    - prompt-injection # Injection attacks
  plugins:
    - harmful:illegal
    - rbac
```

## Advanced Configuration

<details>
<summary>Full configuration options</summary>

### Basic Settings

```yaml
config:
  width: 800 # Canvas dimensions
  height: 400
  fontSize: 24 # Base font size
  format: png # png or jpeg
  background: '#ffffff' # Background color
  textColor: '#000000' # Text color
```

### Per-Character Distortions

```yaml
perChar:
  enabled: true
  rotateDegrees: { min: -15, max: 15 } # Rotation per character
  jitterX: { min: -3, max: 3 } # Horizontal displacement
  jitterY: { min: -3, max: 3 } # Vertical displacement
  scale: { min: 0.8, max: 1.2 } # Size variation
  fontPerChar: true # Random font per character
  waveBaseline: # Wavy text baseline
    amplitude: 8
    frequency: 0.5
```

### Visual Noise

```yaml
overlays:
  clutterLines: { min: 10, max: 20 } # Random lines
  speckles: { min: 100, max: 200 } # Noise dots
  backgroundPattern: grid # none, gradient, grid, noise
  backgroundPatternOpacity: 0.2
```

### Color Manipulation

```yaml
color:
  multicolorLetters: true # Random colors per character
  lowContrastText: false # Reduce contrast
  channelShift: # Chromatic aberration
    dxR: 2 # Red channel offset
    dxB: -2 # Blue channel offset
    opacity: 0.5
```

### Geometric Transforms

```yaml
transformations:
  rotateDegrees: { min: -5, max: 5 } # Global rotation
  blur: 0.5 # Gaussian blur
  perspectiveSkew: # 3D skew
    xDeg: { min: -8, max: 8 }
    yDeg: { min: -6, max: 6 }
  deepFry: # Meme-style degradation
    intensity: 2
    jpegQuality: 30
```

### Occlusion

```yaml
occlusion:
  patches: { min: 2, max: 5 } # Blocking rectangles
  patchSize: { min: 15, max: 30 }
  substituteChars: true # Replace with homoglyphs
  substitutionProbability: 0.2
```

### Hidden Information

```yaml
hidden:
  lowContrast: true # Near-invisible overlay
  lowContrastOpacity: 0.08
  exif: true # Embed in metadata
  microtext: true # Tiny background text
```

</details>

## Technical Details

### Why These Attacks Work

**Per-character perturbations** exploit the gap between human visual processing and how multimodal LLMs interpret text in images. Small rotations (±10°) can cause models to misinterpret or ignore safety-critical content while humans read it clearly.

**Structured noise** creates adversarial features that vision transformers may misclassify, causing the model to focus on noise patterns rather than the actual text content, potentially bypassing content filters.

**Color manipulation** disrupts the visual encoding pipeline in multimodal models. Multi-color text and chromatic aberrations can cause the model to process text differently than its plain-text training, revealing inconsistent safety boundaries.

**Perspective skew** challenges the model's spatial understanding. Vision-language models trained primarily on front-facing text struggle with perspective distortions, potentially allowing harmful content through when skewed.

## Variables and Metadata

The strategy modifies test variables:

- `{{image}}` - Base64-encoded image data
- `{{image_text}}` - Original text content (preserved)

Test metadata includes:

- `strategyId: 'image'` or `'image:[preset]'`
- `imageFormat: 'png'` or `'jpeg'`
- `originalText` - Source text before conversion

## Best Practices

1. Start with `image:moderate` for most testing scenarios
2. Test progressively from `subtle` to `extreme` to find vulnerability thresholds
3. Combine with other strategies for comprehensive multi-modal testing
4. Verify your provider accepts the image format (PNG vs JPEG)
5. Note that image strategies increase payload size significantly

## Limitations

- `image:basic` requires Sharp library installation
- Base64 encoding increases payload size
- Some providers have image size limits
- EXIF metadata may be stripped by gateways
- Extreme settings can make text illegible

## Related Strategies

- [Audio Jailbreaking](audio.md) - Speech-encoded prompts
- [Video Jailbreaking](video.md) - Video input vulnerabilities
- [Base64 Encoding](base64.md) - Text-only obfuscation
- [Multi-Modal Red Teaming Guide](/docs/guides/multimodal-red-team)
