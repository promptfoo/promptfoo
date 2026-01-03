---
sidebar_label: Video Generation
title: Evaluate and Compare AI Video Generation Models
description: Benchmark Sora, Veo, Nova Reel, and Ray with automated video evaluation. Run repeatable comparisons using LLM-as-a-judge scoring.
keywords:
  - ai video generation
  - video model evaluation
  - video benchmarking
  - sora vs veo
  - sora
  - veo
  - amazon nova reel
  - luma ray
  - text to video
  - image to video
  - llm as a judge
  - promptfoo
---

Benchmark AI video generation models with promptfoo. Generate videos across providers, then score prompt adherence, motion quality, and temporal consistency using repeatable rubrics and an automated multimodal judge.

## Why Use promptfoo for Video Evaluation

- **Repeatable comparisons**: Same prompts, same rubrics, across all providers
- **Regression testing**: Catch quality drops when prompts or models change
- **Automated scoring**: LLM-as-a-judge eliminates manual review for most cases
- **CI-friendly**: Run evaluations on every commit or scheduled jobs
- **Cost tracking**: Compare generation costs alongside quality scores

## Quick Start

### Prerequisites

```bash
npm install -g promptfoo
```

Set environment variables for the providers you want to test:

| Provider  | Required Variables                                         |
| --------- | ---------------------------------------------------------- |
| Sora      | `OPENAI_API_KEY`                                           |
| Veo       | `GOOGLE_PROJECT_ID` + `gcloud auth application-default login` |
| Nova Reel | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |
| Ray       | `LUMA_API_KEY`                                             |

For the judge model (Gemini), set either:
- `GOOGLE_PROJECT_ID` (Vertex AI) or
- `GEMINI_API_KEY` (AI Studio)

### Run Your First Eval

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
          1. A cat is visible throughout the video
          2. The cat interacts with yarn or a ball
          3. Motion is smooth without jitter
          Score 1.0 if all criteria met, 0.5 if one missing, 0.0 if two or more missing.
```

```bash
promptfoo eval
promptfoo view
```

### What You'll See

- Per-provider pass/fail and numeric scores (0.0–1.0)
- Judge reasoning explaining the score
- Links to generated video files
- Side-by-side comparison in the web viewer

Common issues: API quota limits, authentication errors, timeouts on long generations. Check `--verbose` output for details.

## How video-rubric Works

The `video-rubric` assertion sends generated videos to a multimodal judge model (Gemini 3.0 Flash Preview by default) along with your rubric criteria.

:::note
**Terminology**: In this guide, "providers" are the video generators being compared (Sora, Veo, etc.). The "judge model" is the separate LLM that scores the output—configured via the `provider` field inside assertions.
:::

```yaml
tests:
  - vars:
      prompt: A dog running through a field
    assert:
      - type: video-rubric
        value: |
          Evaluate the video:
          1. Subject: A dog is clearly visible
          2. Setting: Outdoor field or grassy area
          3. Action: The dog is running, not walking or standing
          4. Quality: Motion is smooth, no visual artifacts
          Score 1.0 if all met, 0.75 if one issue, 0.5 if two issues, 0.0 if three or more.
```

### Overriding the Judge Model

```yaml
# Per-assertion
assert:
  - type: video-rubric
    provider: vertex:gemini-3-pro-preview  # Judge model, not the video generator
    value: ...

# Or set a default judge for all assertions
defaultTest:
  options:
    provider: vertex:gemini-3-flash-preview
```

### Reliability Considerations

LLM judges can miss subtle motion artifacts or misinterpret prompts. For higher confidence:

- **Run multiple generations**: Use promptfoo's `repeat` option to generate 3–5 samples per prompt
- **Average scores**: Report mean and variance across samples
- **Maintain a validation set**: Periodically compare judge scores to human ratings
- **Use specific rubrics**: Vague criteria produce inconsistent scores

```yaml
tests:
  - vars:
      prompt: A cat playing with yarn
    options:
      repeat: 3  # Generate 3 videos, average scores
    assert:
      - type: video-rubric
        threshold: 0.7
        value: ...
```

## Provider Configuration

Config keys map directly to each vendor's API, so field names and casing differ by provider.

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
        # Options: pan_left, pan_right, zoom_in, zoom_out,
        # dolly_forward, dolly_back, tilt_up, tilt_down, orbit_left
        motion: 'orbit_left'

  # Ray camera motion (natural language)
  - id: luma:video:ray-2
    config:
      aspectRatio: '16:9'
      duration: '5s'
      cameraMotion: 'orbit right slow'
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

## Rubric Templates

Each rubric should include explicit scoring instructions. Copy and adapt these templates.

### Prompt Adherence

```yaml
- type: video-rubric
  value: |
    Original prompt: "{{prompt}}"

    Score each criterion (0.25 points each):
    1. Subject matches the prompt description
    2. Action/movement matches what was requested
    3. Setting/environment is correct
    4. Style/mood aligns with prompt intent

    Total score: sum of points earned. Cap at 0.5 if subject is wrong.
```

### Visual Quality

```yaml
- type: video-rubric
  value: |
    Evaluate visual quality:
    - Resolution is clear, not blurry or pixelated
    - Colors are accurate and consistent frame-to-frame
    - No visual artifacts, glitches, or distortions
    - Lighting appears natural and consistent

    Score: 1.0 if no issues, 0.75 if one minor issue, 0.5 if multiple minor issues, 0.25 if one major issue, 0.0 if unwatchable.
```

### Motion Quality

```yaml
- type: video-rubric
  value: |
    Evaluate motion:
    1. Movement is fluid without jitter or stuttering
    2. Physics appear realistic (gravity, momentum, inertia)
    3. No sudden jumps, teleportation, or frame skips
    4. Speed and acceleration look natural

    Score 1.0 if all criteria met. Deduct 0.25 per failed criterion. Any physics violation caps score at 0.5.
```

### Temporal Consistency

```yaml
- type: video-rubric
  value: |
    Check consistency across frames:
    1. Objects maintain their shape throughout
    2. Colors don't shift or flicker unexpectedly
    3. Lighting direction stays consistent
    4. No unexplained appearance/disappearance of elements

    Score 1.0 if fully consistent. Any flickering or morphing caps score at 0.5. Identity change (wrong subject) scores 0.0.
```

### Keyframe Fidelity

For image-to-video evaluation:

```yaml
- type: video-rubric
  value: |
    This video was generated from a reference start image.

    1. First frame closely matches the reference image
    2. Key elements preserved (subject, composition, colors)
    3. Subject identity remains consistent throughout
    4. Transition from still to motion is smooth

    Score 1.0 if reference is faithfully animated. First frame mismatch caps at 0.5. Identity drift caps at 0.25.
```

### Start-to-End Interpolation

```yaml
- type: video-rubric
  value: |
    This video interpolates between a start and end image.

    1. First frame matches the start image
    2. Last frame matches the end image
    3. Transition is smooth and gradual
    4. Motion path is physically plausible

    Score 1.0 if seamless interpolation. Wrong start frame: 0.0. Wrong end frame: 0.0. Jarring transition: 0.5 max.
```

### Camera Motion

```yaml
- type: video-rubric
  value: |
    Expected camera motion: {{camera_motion}}

    1. Camera performs the specified motion type
    2. Movement is smooth without shake or jitter
    3. Subject remains appropriately framed throughout
    4. Motion speed is consistent, not jerky

    Score 1.0 if motion executed correctly. Wrong motion type: 0.0. Shaky or inconsistent: 0.5 max.
```

### Loop Seamlessness

```yaml
- type: video-rubric
  value: |
    This video should loop seamlessly.

    1. No visible cut or jump at the loop point
    2. Motion continues naturally from end back to start
    3. Colors and lighting match at the transition
    4. No abrupt changes in subject position

    Score 1.0 if perfect loop. Minor seam visible: 0.5. Obvious cut: 0.0.
```

## CI/Regression Testing

Run video evaluations in CI to catch regressions:

```yaml title=".github/workflows/video-eval.yml"
name: Video Eval
on:
  push:
    paths:
      - 'prompts/**'
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6am

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g promptfoo
      - run: promptfoo eval -c video-eval.yaml --no-cache
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - run: promptfoo eval --output results.json
      - uses: actions/upload-artifact@v4
        with:
          name: video-eval-results
          path: results.json
```

Best practices for CI:
- Use a fixed prompt set for consistent baselines
- Set `threshold` on assertions to fail the build on regressions
- Compare against a known-good baseline run
- Cache generated videos to reduce costs on reruns

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
          1. Mountain lake is visible
          2. Sunrise lighting present (warm colors, low sun angle)
          3. Mist or fog effect visible over water
          4. Motion is smooth and calm
          Score 0.25 per criterion met. Deduct 0.1 for any visual artifacts.

  - vars:
      prompt: A chef preparing sushi in a Japanese restaurant
    assert:
      - type: video-rubric
        value: |
          1. Chef figure visible and identifiable
          2. Sushi preparation action shown
          3. Restaurant setting recognizable
          4. Hand movements appear realistic
          Score 0.25 per criterion. Uncanny hand motion caps at 0.5.
```

### Evaluate Image-to-Video Fidelity

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
          2. Product identity maintained throughout video
          3. Rotation motion is smooth and gradual
          4. Lighting remains soft and consistent

          Score 1.0 if faithful to reference. Identity drift caps at 0.5. Wrong first frame: 0.0.
```

### Compare Camera Motion Execution

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
          1. Camera performs the intended motion type (orbit or zoom)
          2. Motion is smooth without jitter or shake
          3. Subject (car) stays centered and well-framed
          4. Speed is consistent throughout

          Score 1.0 if correct motion executed smoothly. Wrong motion type: 0.0. Shaky: 0.5 max.
```

## Best Practices

### Cost Optimization

Video generation is expensive. Reduce costs with:

```yaml
# Cache results (enabled by default)
evaluateOptions:
  cache: true

# Use shorter durations for iteration
providers:
  - id: openai:video:sora-2
    config:
      seconds: 5  # Start short, increase for final eval

# Use Flash for judging (faster and cheaper than Pro)
defaultTest:
  options:
    provider: vertex:gemini-3-flash-preview
```

### Provider Selection Guide

| Use Case               | Recommended                |
| ---------------------- | -------------------------- |
| Highest visual quality | Sora, Veo 3.1              |
| Fastest iteration      | Nova Reel                  |
| Keyframe interpolation | Ray 2, Sora                |
| Camera motion control  | Nova Reel, Ray 2           |
| Audio + video          | Veo 3 (audio preview)      |

## Provider Comparison

:::note
Specifications vary by API version, account tier, and region. Information below is approximate as of January 2025.
:::

### Capabilities

| Feature          | Sora    | Veo 3.1 | Nova Reel | Ray 2   |
| ---------------- | ------- | ------- | --------- | ------- |
| Text-to-Video    | ✓       | ✓       | ✓         | ✓       |
| Image-to-Video   | ✓       | ✓       | ✓         | ✓       |
| Start Keyframe   | ✓       | ✓       | ✓         | ✓       |
| End Keyframe     | ✓       | ✗       | ✗         | ✓       |
| Camera Controls  | ✗       | ✗       | ✓         | ✓       |
| Video Extension  | ✓       | ✗       | ✗         | ✓       |
| Audio Generation | ✗       | ✓       | ✗         | ✗       |
| Looping          | ✓       | ✗       | ✗         | ✓       |

### Specifications (Approximate)

| Provider  | Resolution  | Duration | Aspect Ratios   |
| --------- | ----------- | -------- | --------------- |
| Sora      | 480p–1080p  | 5–20s    | 16:9, 9:16, 1:1 |
| Veo 3.1   | 720p–1080p  | 5–8s     | 16:9, 9:16      |
| Nova Reel | 720p        | 6s       | 16:9, 9:16      |
| Ray 2     | 540p–720p   | 5–9s     | 16:9, 9:16, 1:1 |

## FAQ

### How do I compare Sora vs Veo for prompt adherence?

Add both providers to your config and use a prompt adherence rubric. Run `promptfoo eval` to generate videos from each and score them against the same criteria. The web viewer shows side-by-side results.

### What is LLM-as-a-judge for video evaluation?

Instead of manually watching videos, you send them to a multimodal LLM (like Gemini) with scoring criteria. The model analyzes the video and returns a numeric score with reasoning. This enables automated, repeatable evaluation.

### How do I evaluate temporal consistency?

Use a rubric that checks for object permanence, color stability, and lighting consistency across frames. See the [Temporal Consistency](#temporal-consistency) template above.

### How can I reduce the cost of video benchmarking?

Use shorter video durations (5s instead of 20s) during development. Enable caching to avoid regenerating identical prompts. Use Gemini Flash instead of Pro for judging.

### Can I run video evals in CI?

Yes. Set up a GitHub Action or similar workflow that runs `promptfoo eval` with your video config. Set `threshold` values on assertions to fail builds when scores drop below acceptable levels. See [CI/Regression Testing](#ciregression-testing).

## Related

- [video-rubric assertion reference](/docs/configuration/expected-outputs/model-graded/video-rubric)
- [OpenAI Sora provider](/docs/providers/openai#video-generation-sora)
- [Google Veo provider](/docs/providers/vertex#video-generation-veo)
- [Amazon Nova Reel provider](/docs/providers/aws-bedrock#video-generation-nova-reel)
- [Luma Ray provider](/docs/providers/luma)
