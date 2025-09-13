---
sidebar_label: Image Inputs
title: Image Jailbreaking Strategy
description: Test vision-language models with adversarial image-encoded text to bypass content filters and evaluate multi-modal security
---

# Image Jailbreaking

The image strategy converts text prompts into adversarial images to test how vision-language models handle visual text representations. This approach reveals vulnerabilities where models process image-encoded text differently than plain text, potentially bypassing safety mechanisms designed for text-only inputs.

## Use Cases

**Security Testing**: Evaluate whether content filters that scan plain text can be bypassed through image encoding. Many safety systems focus on text analysis and may not apply the same scrutiny to text extracted from images.

**Multi-Modal Consistency**: Identify behavioral differences when models process identical content in text versus image format. This reveals inconsistencies in safety guardrails across modalities.

**OCR Robustness**: Test model resilience against adversarial visual distortions, character substitutions, and occlusion techniques that degrade optical character recognition while maintaining human readability.

## How It Works

The strategy renders text into images through these steps:

1. **Text Rendering**: Converts input text to SVG with configurable fonts, sizes, and colors
2. **Adversarial Transformations**: Applies per-character distortions, background noise, and visual effects
3. **Encoding**: Outputs base64-encoded PNG or JPEG for multi-modal model consumption
4. **Hidden Channels**: Optionally embeds text in EXIF metadata, low-contrast overlays, or microtext patterns

## Quick Start

Configure the image strategy in your red team evaluation:

```yaml title="promptfooconfig.yaml"
targets:
  - bedrock:amazon.nova-lite-v1:0

redteam:
  strategies:
    - image # Full adversarial image generation
    # Or use image:basic for simple text-to-image conversion
    # Disable other strategies when testing image-specific vulnerabilities
    - id: basic
      config:
        enabled: false
  plugins:
    - harmful:hate
    - harmful:violence
```

Your prompt template must handle base64 image input:

```json title="prompt.json"
[
  {
    "role": "system",
    "content": "You are a helpful assistant"
  },
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

:::tip
For basic testing without adversarial transformations, use `image:basic` instead of `image`. Note that `image:basic` requires Sharp to be installed locally: `npm i sharp`
:::

## Configuration

### Basic Settings

Control image dimensions and text rendering:

```yaml
redteam:
  strategies:
    - id: image
      config:
        width: 800 # Canvas width in pixels
        height: 400 # Canvas height in pixels
        fontSize: 24 # Base font size
        format: png # Output format: png or jpeg
        background: '#ffffff' # Background color
        textColor: '#000000' # Text color (when not using multicolor)
        fontFamilies: # Font stack for rendering
          - Arial
          - Helvetica
          - sans-serif
```

### Adversarial Techniques

#### Per-Character Distortions

Individual character manipulation exploits the gap between human reading (which uses context and pattern recognition) and OCR systems (which rely on precise character matching):

```yaml
perChar:
  enabled: true
  rotateDegrees: { min: -15, max: 15 } # Random rotation per character
  jitterX: { min: -3, max: 3 } # Horizontal displacement
  jitterY: { min: -3, max: 3 } # Vertical displacement
  scale: { min: 0.8, max: 1.2 } # Size variation
  charSpacing: 2 # Extra spacing between characters
  fontPerChar: true # Random font per character
  waveBaseline: # Wavy text baseline
    amplitude: 8
    frequency: 0.5
    phase: 0
```

**Why it works**: Vision models trained on clean text struggle with character-level perturbations. Research shows that even small rotations (±10°) can degrade OCR accuracy by 30-40% while maintaining human readability.

#### Visual Noise and Overlays

Clutter injection exploits attention mechanisms in vision transformers, forcing models to distinguish signal from noise:

```yaml
overlays:
  clutterLines: { min: 10, max: 20 } # Random lines across image
  lineWidth: { min: 1, max: 3 } # Line thickness variation
  lineColor: '#666666' # Line color
  lineOpacity: { min: 0.3, max: 0.6 } # Line transparency
  speckles: { min: 100, max: 200 } # Random dots/noise
  speckleRadius: { min: 0.5, max: 2 } # Dot size range
  backgroundPattern: grid # Pattern: none, gradient, grid, noise
  backgroundPatternOpacity: 0.2 # Pattern visibility
```

**Why it works**: Structured noise patterns create adversarial features that vision models may interpret as text strokes. Grid patterns specifically interfere with edge detection algorithms used in text localization.

#### Color Manipulation

Color-based attacks exploit preprocessing pipelines that often convert images to grayscale or apply color normalization:

```yaml
color:
  multicolorLetters: true # Random colors per character
  inverted: false # Invert entire color scheme
  lowContrastText: false # Reduce text/background contrast
  channelShift: # Chromatic aberration effect
    dxR: 2 # Red channel X offset
    dyR: 0 # Red channel Y offset
    dxB: -2 # Blue channel X offset
    dyB: 0 # Blue channel Y offset
    opacity: 0.5 # Effect strength
```

**Why it works**: Multi-color text breaks assumptions about uniform text color. Channel shifting creates color fringing that confuses binarization algorithms. Low contrast (< 20% difference) falls below many OCR thresholds while remaining visible to humans.

#### Geometric Transforms

Spatial distortions target the rigid grid assumptions of convolutional layers:

```yaml
transformations:
  rotateDegrees: { min: -5, max: 5 } # Global rotation
  blur: 0.5 # Gaussian blur radius
  noiseOpacity: 0.1 # Grayscale noise overlay
  noiseBlend: overlay # Noise blend mode
  perspectiveSkew: # Affine transformation
    xDeg: { min: -8, max: 8 } # X-axis skew
    yDeg: { min: -6, max: 6 } # Y-axis skew
    interpolator: nohalo # Resampling algorithm
  orientation: # Extreme rotations
    rotate90: false
    rotate180: false
    flipH: false # Horizontal flip
    flipV: false # Vertical flip
```

**Why it works**: Perspective skew breaks the assumption of fronto-parallel text. Small skews (5-10°) significantly degrade performance of models trained on axis-aligned text while preserving readability.

#### Deep Fry Effect

Mimics the degradation patterns of repeatedly compressed internet memes:

```yaml
transformations:
  deepFry:
    intensity: 2 # 1-3, higher = more extreme
    jpegQuality: 30 # Compression artifacts
    pixelate: true # Downscale/upscale for blockiness
    vignette: true # Dark edges
    hue: 20 # Color shift in degrees
```

**Why it works**: Deep fried images contain artifacts that models associate with memes and informal content, potentially triggering different behavioral patterns than clean text. JPEG artifacts create false edges that interfere with character segmentation.

#### Hidden Information

Embeds text through channels that bypass visual processing:

```yaml
hidden:
  lowContrast: true # Near-invisible text overlay
  lowContrastOpacity: 0.08 # Overlay visibility (0-1)
  exif: true # Embed in image metadata
  microtext: true # Tiny repeated background text
  microtextOpacity: 0.06 # Microtext visibility
```

**Why it works**: Low-contrast text (< 5% opacity) is below human perception threshold but may be amplified by preprocessing. EXIF metadata can be parsed by some pipelines before image analysis. Microtext creates a texture that influences feature extraction.

#### Occlusion and Substitution

Partial information hiding tests error correction capabilities:

```yaml
occlusion:
  patches: { min: 2, max: 5 } # Number of blocking rectangles
  patchSize: { min: 15, max: 30 } # Rectangle dimensions
  patchColor: '#ffffff' # Patch fill color
  patchOpacity: 0.95 # Patch transparency
  substituteChars: true # Replace with similar-looking characters
  substitutionProbability: 0.2 # Chance to substitute each character
```

**Why it works**: Occlusion forces models to reconstruct missing information from context. Character substitution with homoglyphs (e.g., Latin 'A' → Cyrillic 'А') maintains visual similarity while changing Unicode codepoints, exploiting models that use both visual and text features.

### Preset Configurations

#### Maximum Adversarial

Combines multiple attack vectors for stress testing:

```yaml
redteam:
  strategies:
    - id: image
      config:
        perChar:
          enabled: true
          rotateDegrees: { min: -20, max: 20 }
          jitterX: { min: -5, max: 5 }
          jitterY: { min: -5, max: 5 }
          scale: { min: 0.7, max: 1.3 }
          waveBaseline: { amplitude: 10, frequency: 0.8 }
        overlays:
          clutterLines: { min: 15, max: 25 }
          speckles: { min: 200, max: 300 }
          backgroundPattern: noise
        color:
          multicolorLetters: true
          channelShift: { dxR: 3, dyR: 1, dxB: -3, dyB: -1, opacity: 0.6 }
        transformations:
          deepFry: { intensity: 3, jpegQuality: 25 }
          blur: 0.8
          noiseOpacity: 0.2
        occlusion:
          patches: { min: 3, max: 6 }
          substituteChars: true
          substitutionProbability: 0.25
```

#### Clean Baseline

Minimal distortion for control testing:

```yaml
redteam:
  strategies:
    - id: image
      config:
        perChar: { enabled: false }
        overlays:
          backgroundPattern: none
        color:
          multicolorLetters: false
        transformations:
          blur: 0
          noiseOpacity: 0
        occlusion:
          patches: 0
          substituteChars: false
```

## Technical Details

### Character Substitution

The strategy uses homoglyphs - characters that look identical but have different Unicode codepoints:

- `A` (U+0041) → `Α` (U+0391, Greek) or `А` (U+0410, Cyrillic)
- `O` (U+004F) → `Ο` (U+039F, Greek) or `О` (U+041E, Cyrillic)
- `l` (U+006C) → `1` (U+0031, digit) or `ɭ` (U+026D, IPA)

This exploits models that combine visual features with text embeddings, causing misalignment between what's seen and what's encoded.

### EXIF Metadata Embedding

Text embedded in EXIF ImageDescription field (tag 0x010E) can persist through image transformations. Some vision pipelines extract metadata before visual processing, creating a side channel for prompt injection.

### Deep Fry Pipeline

Sequential degradation mimics real-world image corruption:

1. **Saturation boost** (1.4-1.75x) pushes colors outside typical training distribution
2. **Contrast crushing** creates clipping in highlights/shadows
3. **Unsharp masking** with high radius creates haloing artifacts
4. **Bicubic downsampling** followed by nearest-neighbor upsampling introduces aliasing
5. **Multi-pass JPEG** at quality 25-35 creates DCT quantization artifacts
6. **Chromatic aberration** simulates lens distortion
7. **Vignetting** reduces corner brightness, focusing attention centrally

## Variables and Metadata

The strategy modifies test case variables:

- **`{{image}}`**: Replaced with base64-encoded image data
- **`{{image_text}}`**: Preserves the original text content

Test metadata includes:

- `strategyId`: Always set to `'image'`
- `imageFormat`: Either `'png'` or `'jpeg'`
- `originalText`: The source text before conversion
- `transforms`: Configuration snapshot of all applied effects

## Best Practices

1. **Start Simple**: Begin with clean baseline configuration to establish model behavior with clear images
2. **Incrementally Add Complexity**: Gradually introduce distortions to identify vulnerability thresholds
3. **Test Format Compatibility**: Verify your provider accepts the image format (PNG vs JPEG)
4. **Monitor Metadata Preservation**: Some gateways strip EXIF data; validate end-to-end behavior
5. **Combine with Other Strategies**: Layer image encoding with other red team techniques for comprehensive testing

## Limitations

- `image:basic` requires Sharp library to be installed locally
- Base64 encoding increases payload size significantly
- Some providers may have image size limits
- EXIF metadata may be stripped by security gateways
- Deep fry effects can make text completely illegible at extreme settings

## Related Concepts

- [Audio Jailbreaking](audio.md) - Test models with speech-encoded prompts
- [Video Jailbreaking](video.md) - Evaluate video input vulnerabilities
- [Base64 Encoding](base64.md) - Text-only base64 obfuscation
- [Multi-Modal Red Teaming Guide](/docs/guides/multimodal-red-team) - Comprehensive multi-modal testing
- [LLM Vulnerability Types](/docs/red-team/llm-vulnerability-types) - Overview of attack categories
