---
sidebar_label: Video Generation
title: Evaluate and Compare AI Video Generation Models
description: Compare OpenAI Sora, Google Veo, Amazon Nova Reel, and Luma Ray with automated video evaluation using LLM-as-a-judge grading.
keywords:
  [
    video generation,
    sora,
    veo,
    nova reel,
    luma ray,
    video evaluation,
    ai video,
    text to video,
    image to video,
  ]
---

# Evaluate Video Generation Models

Compare video generation providers and automate quality assessment using multimodal LLMs.

## Quick Start

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{prompt}}'

providers:
  - openai:video:sora-2
  - vertex:video:veo-3.1-generate-preview

tests:
  - vars:
      prompt: A cat playing with a ball of yarn
    assert:
      - type: video-rubric
        value: |
          1. A cat is visible
          2. The cat interacts with yarn or a ball
          3. Motion is smooth
          Score 1.0 if all met, 0.5 if partial, 0.0 if none.
```

```bash
promptfoo eval
```

## Provider Comparison

### Capabilities

| Feature          | Sora    | Veo 3.1 | Nova Reel | Ray 2   | Azure Sora |
| ---------------- | ------- | ------- | --------- | ------- | ---------- |
| Text-to-Video    | ✓       | ✓       | ✓         | ✓       | ✓          |
| Image-to-Video   | ✓       | ✓       | ✓         | ✓       | ✓          |
| Start Keyframe   | ✓       | ✓       | ✓         | ✓       | ✓          |
| End Keyframe     | ✓       | ✗       | ✗         | ✓       | ✓          |
| Camera Controls  | ✗       | ✗       | ✓         | ✓       | ✗          |
| Video Extension  | ✓       | ✗       | ✗         | ✓       | ✓          |
| Audio Generation | ✗       | ✓ (v3)  | ✗         | ✗       | ✗          |
| Looping          | ✓       | ✗       | ✗         | ✓       | ✓          |

### Specifications

| Provider   | Resolution  | Duration | Aspect Ratios   | Generation Time |
| ---------- | ----------- | -------- | --------------- | --------------- |
| Sora       | 480p-1080p  | 5-20s    | 16:9, 9:16, 1:1 | 1-3 min         |
| Veo 3.1    | 720p-1080p  | 5-8s     | 16:9, 9:16      | 30-90s          |
| Nova Reel  | 720p        | 6s       | 16:9, 9:16      | 20-45s          |
| Ray 2      | 540p-720p   | 5-9s     | 16:9, 9:16, 1:1 | 30-60s          |
| Azure Sora | 480p-1080p  | 5-20s    | 16:9, 9:16, 1:1 | 1-3 min         |

## Provider Configuration

### Text-to-Video

```yaml
providers:
  # OpenAI Sora
  - id: openai:video:sora-2
    config:
      size: '1280x720'
      seconds: 5

  # Google Veo
  - id: vertex:video:veo-3.1-generate-preview
    config:
      aspectRatio: '16:9'
      durationSeconds: 5

  # Amazon Nova Reel
  - id: bedrock:video:amazon.nova-reel-v1:1
    config:
      durationSeconds: 6
      dimension: '1280x720'

  # Luma Ray
  - id: luma:video:ray-2
    config:
      aspectRatio: '16:9'
      duration: '5s'
```

### Image-to-Video (Start Keyframe)

Generate video starting from a reference image:

```yaml
providers:
  # Sora with start image
  - id: openai:video:sora-2
    config:
      size: '1280x720'
      seconds: 10
      image: '{{start_image}}'

  # Nova Reel with start image
  - id: bedrock:video:amazon.nova-reel-v1:1
    config:
      durationSeconds: 6
      images:
        - url: '{{start_image}}'
          position: 'start'

  # Ray with start keyframe
  - id: luma:video:ray-2
    config:
      aspectRatio: '16:9'
      duration: '5s'
      keyframes:
        frame0:
          type: image
          url: '{{start_image}}'
```

### Start and End Keyframes

Interpolate between two images:

```yaml
providers:
  # Ray with both keyframes
  - id: luma:video:ray-2
    config:
      aspectRatio: '16:9'
      duration: '5s'
      keyframes:
        frame0:
          type: image
          url: '{{start_image}}'
        frame1:
          type: image
          url: '{{end_image}}'

  # Sora with end frame
  - id: openai:video:sora-2
    config:
      size: '1280x720'
      seconds: 10
      image: '{{start_image}}'
      end_image: '{{end_image}}'
```

### Camera Motion

```yaml
providers:
  # Nova Reel camera presets
  - id: bedrock:video:amazon.nova-reel-v1:1
    config:
      durationSeconds: 6
      dimension: '1280x720'
      camera:
        motion: 'orbit_left' # pan_left, pan_right, zoom_in, zoom_out,
        # dolly_forward, dolly_back, tilt_up, tilt_down

  # Ray camera motion
  - id: luma:video:ray-2
    config:
      aspectRatio: '16:9'
      duration: '5s'
      cameraMotion: 'orbit right slow' # Natural language description
```

### Looping Video

```yaml
providers:
  - id: luma:video:ray-2
    config:
      aspectRatio: '16:9'
      duration: '5s'
      loop: true
```

## Evaluation with video-rubric

The `video-rubric` assertion sends video content to a multimodal LLM (Gemini) for evaluation.

```yaml
tests:
  - vars:
      prompt: A dog running through a field
    assert:
      - type: video-rubric
        value: |
          Evaluate the video:
          1. Subject: A dog is visible
          2. Setting: Outdoor field or grassy area
          3. Action: The dog is running
          4. Quality: Smooth motion, no artifacts
```

### Grading Provider

By default, `video-rubric` uses Gemini 3.0 Flash Preview. Override with:

```yaml
defaultTest:
  options:
    provider: vertex:gemini-3-pro-preview

# Or per-assertion
assert:
  - type: video-rubric
    provider: vertex:gemini-3-pro-preview
    value: ...
```

Requires either:

- `GOOGLE_PROJECT_ID` + application default credentials (Vertex AI)
- `GEMINI_API_KEY` (AI Studio)

## Rubric Templates

### Prompt Adherence

```yaml
- type: video-rubric
  value: |
    Prompt: "{{prompt}}"

    Score each criterion (0.25 points each):
    1. Subject matches the prompt
    2. Action matches the prompt
    3. Setting/environment matches
    4. Style/mood matches

    Total score: sum of criteria met.
```

### Visual Quality

```yaml
- type: video-rubric
  value: |
    Evaluate visual quality:
    - Resolution is clear, not blurry
    - Colors are accurate and consistent
    - No visual artifacts or distortions
    - Lighting is natural

    Score: 1.0=excellent, 0.7=good, 0.4=acceptable, 0.0=poor
```

### Motion Quality

```yaml
- type: video-rubric
  value: |
    Evaluate motion:
    1. Movement is fluid, no jitter or stuttering
    2. Physics appear realistic (gravity, momentum)
    3. No sudden jumps or teleportation
    4. Speed and acceleration are natural

    Score 1.0 if all criteria met, deduct 0.25 per issue.
```

### Temporal Consistency

```yaml
- type: video-rubric
  value: |
    Check consistency across frames:
    1. Objects maintain shape and color throughout
    2. No flickering or strobing effects
    3. Lighting remains consistent
    4. No unexplained scene changes

    Score based on consistency. Any flickering = 0.5 max.
```

### Keyframe Fidelity

For image-to-video evaluation:

```yaml
- type: video-rubric
  value: |
    This video was generated from a reference start image.

    1. First frame closely matches the reference
    2. Key elements preserved (subject, composition, colors)
    3. Subject identity consistent throughout
    4. Smooth transition from still to motion

    Score based on fidelity to reference.
```

### Start-to-End Interpolation

```yaml
- type: video-rubric
  value: |
    This video interpolates from start image to end image.

    1. First frame matches start image
    2. Last frame matches end image
    3. Transition is smooth and gradual
    4. Motion path is physically plausible

    Score: 1.0 if seamless interpolation, 0.0 if either keyframe wrong.
```

### Camera Motion

```yaml
- type: video-rubric
  value: |
    Expected camera motion: {{camera_motion}}

    1. Camera performs the correct motion type
    2. Movement is smooth, no shake
    3. Subject stays appropriately framed
    4. Motion speed is consistent
```

### Loop Seamlessness

```yaml
- type: video-rubric
  value: |
    This should loop seamlessly.

    1. No visible cut at the loop point
    2. Motion continues naturally from end to start
    3. Colors and lighting match at transition

    Score: 1.0=perfect loop, 0.5=minor seam, 0.0=obvious cut
```

## Complete Examples

### Compare Text-to-Video Providers

```yaml title="compare-providers.yaml"
description: Compare video generation across providers

prompts:
  - '{{prompt}}'

providers:
  - id: openai:video:sora-2
    config:
      size: '1280x720'
      seconds: 5
  - id: vertex:video:veo-3.1-generate-preview
    config:
      aspectRatio: '16:9'
      durationSeconds: 5
  - id: bedrock:video:amazon.nova-reel-v1:1
    config:
      durationSeconds: 6
      dimension: '1280x720'

defaultTest:
  options:
    provider: vertex:gemini-3-flash-preview

tests:
  - vars:
      prompt: A serene mountain lake at sunrise with mist rising from the water
    assert:
      - type: video-rubric
        value: |
          1. Mountain lake visible
          2. Sunrise lighting (warm colors)
          3. Mist or fog effect present
          4. Smooth, calm motion
          Score 0.25 per criterion.

  - vars:
      prompt: A chef preparing sushi in a Japanese restaurant
    assert:
      - type: video-rubric
        value: |
          1. Chef figure visible
          2. Sushi preparation action
          3. Restaurant setting
          4. Realistic hand movements
          Score 0.25 per criterion.
```

### Evaluate Image-to-Video

```yaml title="image-to-video-eval.yaml"
description: Test image-to-video fidelity

prompts:
  - 'Animate this image: {{animation_prompt}}'

providers:
  - id: luma:video:ray-2
    config:
      aspectRatio: '16:9'
      duration: '5s'
      keyframes:
        frame0:
          type: image
          url: '{{reference_image}}'

tests:
  - vars:
      reference_image: https://example.com/product-photo.jpg
      animation_prompt: Slowly rotate the product with soft lighting
    assert:
      - type: video-rubric
        value: |
          A reference image was provided as the start frame.

          1. First frame matches the reference image closely
          2. Product identity maintained throughout
          3. Rotation motion is smooth and gradual
          4. Lighting remains consistent

          Score based on fidelity. Any identity drift = max 0.5.
```

### Compare Camera Motions

```yaml title="camera-motion-eval.yaml"
description: Evaluate camera motion accuracy

prompts:
  - 'A red sports car parked in a showroom'

providers:
  - id: bedrock:video:amazon.nova-reel-v1:1
    label: Nova - Orbit Left
    config:
      durationSeconds: 6
      camera:
        motion: 'orbit_left'

  - id: bedrock:video:amazon.nova-reel-v1:1
    label: Nova - Zoom In
    config:
      durationSeconds: 6
      camera:
        motion: 'zoom_in'

  - id: luma:video:ray-2
    label: Ray - Orbit
    config:
      duration: '5s'
      cameraMotion: 'orbit left slow'

tests:
  - assert:
      - type: video-rubric
        value: |
          Evaluate camera motion execution:
          1. Camera performs the intended motion type
          2. Motion is smooth without jitter
          3. Subject (car) stays centered/framed
          4. Speed is consistent throughout
```

## Best Practices

### Rubric Design

- One dimension per rubric for clear scoring
- Include explicit scoring guidance (what score for what outcome)
- Reference `{{variables}}` for dynamic context
- Set `threshold` for pass/fail clarity

```yaml
assert:
  - type: video-rubric
    threshold: 0.7
    value: ...
```

### Cost Optimization

Video generation is expensive. Optimize with:

```yaml
# Cache results (default behavior)
evaluateOptions:
  cache: true

# Use shorter durations for initial testing
providers:
  - id: openai:video:sora-2
    config:
      seconds: 5 # Start short, increase for final eval

# Use Flash for grading (cheaper than Pro)
defaultTest:
  options:
    provider: vertex:gemini-3-flash-preview
```

### Provider Selection

| Use Case                | Recommended Provider |
| ----------------------- | -------------------- |
| Highest quality         | Sora, Veo 3.1        |
| Fastest iteration       | Nova Reel            |
| Keyframe interpolation  | Ray 2, Sora          |
| Camera motion control   | Nova Reel, Ray 2     |
| Audio + video           | Veo 3 (preview)      |
| Enterprise/compliance   | Azure Sora           |

## Environment Variables

| Provider   | Required Variables                                        |
| ---------- | --------------------------------------------------------- |
| Sora       | `OPENAI_API_KEY`                                          |
| Veo        | `GOOGLE_PROJECT_ID` + gcloud auth                         |
| Nova Reel  | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`|
| Ray        | `LUMA_API_KEY`                                            |
| Azure Sora | `AZURE_API_KEY`, `AZURE_RESOURCE_NAME`                    |
| Grading    | `GOOGLE_PROJECT_ID` or `GEMINI_API_KEY`                   |

## Related

- [video-rubric assertion](/docs/configuration/expected-outputs/model-graded/video-rubric)
- [OpenAI Sora provider](/docs/providers/openai#video-generation-sora)
- [Google Veo provider](/docs/providers/google#video-generation-veo)
- [Amazon Nova Reel provider](/docs/providers/aws-bedrock#video-generation-nova-reel)
- [Luma Ray provider](/docs/providers/luma)
