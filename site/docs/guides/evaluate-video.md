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

Benchmark Sora, Veo, Amazon Nova Reel, and Luma Ray with promptfoo. Generate text-to-video and image-to-video outputs, then score prompt adherence, motion quality, and temporal consistency using repeatable rubrics and an automated multimodal judge.

## Why Use promptfoo for Video Evaluation

- **Repeatable comparisons**: Same prompts, same rubrics, across all providers
- **Regression testing**: Catch quality drops when prompts or models change
- **Automated scoring**: LLM-as-a-judge eliminates manual review for most cases
- **CI-friendly**: Run evaluations on every commit or scheduled jobs

## Core Concepts

Before diving in, here's how promptfoo's primitives map to video evaluation:

| Concept       | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| **Prompt**    | Text instruction (and optional keyframe images) sent to the video generator |
| **Provider**  | Video model being benchmarked (Sora, Veo, Nova Reel, Ray)                   |
| **Test case** | One prompt + variables + assertions                                         |
| **Assertion** | Scoring rule applied to the output (`video-rubric`)                         |
| **Judge**     | Multimodal LLM that analyzes the video and returns a score (Gemini)         |
| **Threshold** | Minimum score for pass/fail gating in CI                                    |
| **Repeat**    | Number of generations per test case for variance measurement                |

## Quick Start

### Prerequisites

**Install promptfoo:**

```bash
npm install -g promptfoo
```

**Set up credentials for each provider you want to test:**

- **Sora**: Set `OPENAI_API_KEY`
- **Veo**: Set `GOOGLE_PROJECT_ID` and run `gcloud auth application-default login`
- **Nova Reel**: Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`. Enable model access in the AWS Bedrock console.
- **Ray**: Set `LUMA_API_KEY`

**Set up credentials for the judge model (Gemini):**

- Vertex AI: Set `GOOGLE_PROJECT_ID` (uses application default credentials)
- AI Studio: Set `GEMINI_API_KEY`

:::note
Some video models are preview/limited access and require enablement or may be region-restricted. Check each provider's documentation for availability.
:::

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
- Generated video files in the output directory
- Side-by-side comparison in the web viewer

## Automated Video Evaluation with LLM-as-a-Judge

The `video-rubric` assertion sends generated videos to a multimodal judge model along with your rubric criteria.

:::note
**Terminology**: In this guide, "providers" are the video generators being compared (Sora, Veo, etc.). The "judge" is the separate multimodal LLM that scores the output—configured via the `provider` field inside assertions.
:::

### Inputs and Outputs

**Inputs to the judge:**

- Video file (base64-encoded, up to 20MB)
- Your rubric text
- Original prompt (via `{{prompt}}` variable)
- Optional: reference images for keyframe comparisons

**Outputs from the judge:**

- `score`: Numeric value 0.0–1.0
- `pass`: Boolean based on threshold comparison
- `reason`: Text explanation of the score

### Scoring Semantics

Understanding how scores are computed and aggregated:

- **Per-assertion scoring**: Each `video-rubric` assertion produces an independent score
- **Threshold application**: `threshold: 0.7` means scores ≥ 0.7 pass, < 0.7 fail
- **Repeat aggregation**: When using `repeat: N`, promptfoo generates N videos and reports individual scores. Use this to measure variance, not to auto-average.
- **Multiple assertions**: Each assertion is evaluated separately. A test case passes only if all assertions pass.

```yaml
tests:
  - vars:
      prompt: A dog running through a field
    assert:
      - type: video-rubric
        threshold: 0.7
        value: |
          Evaluate the video:
          1. Subject: A dog is clearly visible
          2. Setting: Outdoor field or grassy area
          3. Action: The dog is running, not walking or standing
          4. Quality: Motion is smooth, no visual artifacts
          Score 1.0 if all met, 0.75 if one issue, 0.5 if two issues, 0.0 if three or more.
```

### Overriding the Judge Model

The default judge is Gemini 3 Flash Preview. Override it per-assertion or globally:

```yaml
# Per-assertion
assert:
  - type: video-rubric
    provider: vertex:gemini-3-pro-preview # Judge, not the video generator
    value: ...

# Global default for all assertions
defaultTest:
  options:
    provider: vertex:gemini-3-flash-preview
```

See the [video-rubric reference](/docs/configuration/expected-outputs/model-graded/video-rubric) for full configuration options.

### Reliability and Variance

LLM judges can miss subtle motion artifacts or misinterpret prompts. For higher confidence:

- **Run multiple generations**: Use `repeat` to generate 3–5 samples per prompt
- **Compare scores**: Look for high variance as a signal of ambiguous rubrics
- **Maintain a validation set**: Periodically compare judge scores to human ratings
- **Use specific rubrics**: Vague criteria produce inconsistent scores

```yaml
tests:
  - vars:
      prompt: A cat playing with yarn
    options:
      repeat: 3 # Generate 3 videos, compare scores
    assert:
      - type: video-rubric
        threshold: 0.7
        value: ...
```

## Configure Sora, Veo, Nova Reel, and Ray

Config keys map directly to each vendor's API, so field names and casing differ by provider.

### Text-to-Video Evaluation

```yaml
providers:
  # OpenAI Sora
  - id: openai:video:sora-2
    config:
      size: '1280x720'
      seconds: 4

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

### Image-to-Video Evaluation

Generate video starting from a reference image (start keyframe):

```yaml
providers:
  # Sora with start image
  - id: openai:video:sora-2
    config:
      size: '1280x720'
      seconds: 8
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

### Start and End Keyframe Interpolation

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
      seconds: 8
      image: '{{start_image}}'
      end_image: '{{end_image}}'
```

### Camera Motion Configuration

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

## What Works Well

Based on testing, these prompt patterns produce reliable, high-scoring results:

| Pattern                    | Example                       | Typical Score |
| -------------------------- | ----------------------------- | ------------- |
| Simple subject + action    | "A cat playing with yarn"     | 1.0           |
| Character + gesture        | "Red panda giving thumbs up"  | 1.0           |
| Text overlays              | "Sign that says 'LGTM'"       | 0.9–1.0       |
| Approval/rejection actions | "Stamps 'APPROVED' on screen" | 0.98–1.0      |
| Identity consistency       | "Same character throughout"   | 0.875+        |

**Challenging patterns** (lower scores or failures):

- State transitions: "Status changes from red to green" — often shows final state only
- Complex sequences: Multiple distinct actions in order
- Precise timing: "Hold for 2 seconds" — variable results

## Sora vs Veo Benchmark Example

Compare OpenAI Sora and Google Veo head-to-head with multiple evaluation dimensions:

```yaml title="sora-vs-veo.yaml"
description: Sora vs Veo benchmark

prompts:
  - '{{prompt}}'

providers:
  - id: openai:video:sora-2
    label: Sora 2
    config:
      size: '1280x720'
      seconds: 4
  - id: vertex:video:veo-3.1-generate-preview
    label: Veo 3.1
    config:
      aspectRatio: '16:9'
      durationSeconds: 5

defaultTest:
  options:
    repeat: 3 # Generate 3 samples per provider for variance
    provider: vertex:gemini-3-flash-preview

tests:
  - vars:
      prompt: A golden retriever running on a beach at sunset
    assert:
      - type: video-rubric
        threshold: 0.7
        value: |
          Prompt adherence:
          1. Dog (golden retriever or similar) is visible
          2. Beach setting with sand and water
          3. Dog is running, not walking
          4. Sunset lighting (warm colors)
          Score 0.25 per criterion. Wrong subject: 0.0.

      - type: video-rubric
        threshold: 0.6
        value: |
          Temporal consistency:
          1. Dog maintains consistent appearance throughout
          2. No flickering or morphing artifacts
          3. Lighting stays consistent
          4. No objects appearing/disappearing unexpectedly
          Score 1.0 if consistent. Any flickering: max 0.5. Identity change: 0.0.
```

Run and compare:

```bash
promptfoo eval -c sora-vs-veo.yaml
promptfoo view
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

## CI/CD Integration

### Basic CI Workflow

Run video evaluations in CI to catch regressions:

```yaml title=".github/workflows/video-eval.yml"
name: Video Eval
on:
  pull_request:
    paths:
      - 'prompts/**'
      - 'video-eval.yaml'
  schedule:
    - cron: '0 6 * * 1' # Weekly Monday 6am

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g promptfoo

      - name: Run video evaluation
        run: promptfoo eval -c video-eval.yaml -o results.json --no-cache
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: video-eval-results
          path: |
            results.json
            output/  # Contains generated videos
```

### PR vs Scheduled Runs

For cost efficiency, use different configurations:

**PR runs (fast smoke test):**

```yaml title="video-eval-pr.yaml"
providers:
  - id: openai:video:sora-2
    config:
      seconds: 4 # Shorter duration

tests:
  - vars:
      prompt: Quick smoke test prompt
    assert:
      - type: video-rubric
        threshold: 0.6 # Looser threshold for smoke tests
        value: Basic quality check...
```

**Scheduled runs (full regression):**

```yaml title="video-eval-full.yaml"
providers:
  - id: openai:video:sora-2
    config:
      seconds: 12
  - id: vertex:video:veo-3.1-generate-preview
    config:
      durationSeconds: 8

defaultTest:
  options:
    repeat: 3 # Multiple samples for variance

tests:
  # Full prompt set with strict thresholds
  - vars:
      prompt: ...
    assert:
      - type: video-rubric
        threshold: 0.8
        value: ...
```

## Troubleshooting

### Authentication Failures

**Vertex AI / Veo:**

```
Error: Could not load the default credentials
```

Run `gcloud auth application-default login` and ensure `GOOGLE_PROJECT_ID` is set.

```
Error: invalid_grant - reauth related error (invalid_rapt)
```

Your credentials have expired. Re-run `gcloud auth application-default login` to refresh.

**AWS Bedrock / Nova Reel:**

```
Error: Access denied to model
```

Enable model access in the AWS Bedrock console. Model access is per-region and requires explicit approval.

**OpenAI / Sora:**

```
Error: Invalid API key
```

Verify `OPENAI_API_KEY` is set and has access to the Sora API (may require specific plan).

### Sora Configuration

```
Error: Invalid video duration "5". Valid options: 4, 8, 12
```

Sora only accepts specific duration values: `4`, `8`, or `12` seconds. Other values will fail.

### Quota and Timeout Issues

- **Timeouts on long generations**: Start with `seconds: 4` and increase gradually
- **Rate limits**: Reduce concurrent providers while iterating
- **Queue delays**: Video generation latency varies significantly; expect 30s–3min per video

### Moderation Blocks

```
Error: Your request was blocked by our moderation system
```

Some prompts trigger content moderation even when innocuous. Try rephrasing or simplifying the prompt.

### Artifact Storage

Generated videos are stored in the promptfoo output directory (default: `~/.promptfoo/output/`). To manage disk space:

```bash
# View cache location
promptfoo cache path

# Clear old results (use cautiously)
promptfoo cache clear
```

### Judge Disagreements

If scores seem inconsistent:

1. **Tighten rubric wording**: Remove ambiguous terms
2. **Add explicit caps**: "If X, max score is Y" — the judge correctly applies these rules
3. **Increase repeat count**: Compare variance across samples
4. **Try a stronger judge**: Use `vertex:gemini-3-pro-preview` for complex evaluations

### Complex Prompts

Multi-step sequences (e.g., "status changes from red to green, then user reacts") are challenging for video generators. If a video shows the final state without the transition, the judge will correctly identify the missing sequence and apply score caps.

## Provider Comparison

:::note
Specifications vary by API version, account tier, and region. Information below is approximate as of January 2025. Recommendations are subjective and change over time.
:::

### Capabilities

| Feature          | Sora | Veo 3.1     | Nova Reel | Ray 2 |
| ---------------- | ---- | ----------- | --------- | ----- |
| Text-to-Video    | ✓    | ✓           | ✓         | ✓     |
| Image-to-Video   | ✓    | ✓           | ✓         | ✓     |
| Start Keyframe   | ✓    | ✓           | ✓         | ✓     |
| End Keyframe     | ✓    | ✗           | ✗         | ✓     |
| Camera Controls  | ✗    | ✗           | ✓         | ✓     |
| Video Extension  | ✓    | ✗           | ✗         | ✓     |
| Audio Generation | ✗    | ✓ (preview) | ✗         | ✗     |
| Looping          | ✓    | ✗           | ✗         | ✓     |

### Specifications (Approximate)

| Provider  | Resolution | Duration     | Aspect Ratios   |
| --------- | ---------- | ------------ | --------------- |
| Sora      | 480p–1080p | 4, 8, or 12s | 16:9, 9:16, 1:1 |
| Veo 3.1   | 720p–1080p | 5–8s         | 16:9, 9:16      |
| Nova Reel | 720p       | 6s           | 16:9, 9:16      |
| Ray 2     | 540p–720p  | 5–9s         | 16:9, 9:16, 1:1 |

### Provider Selection Guide

| Use Case               | Recommended                |
| ---------------------- | -------------------------- |
| Highest visual quality | Sora, Veo 3.1              |
| Fastest iteration      | Nova Reel                  |
| Keyframe interpolation | Ray 2, Sora                |
| Camera motion control  | Nova Reel, Ray 2           |
| Audio + video          | Veo 3.1 (audio in preview) |

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
      seconds: 4 # Start short, increase for final eval

# Use Flash for judging (faster and cheaper than Pro)
defaultTest:
  options:
    provider: vertex:gemini-3-flash-preview
```

### Rubric Design

- **One dimension per rubric**: Easier to diagnose failures
- **Explicit scoring**: Always include "Score X if Y"
- **Failure caps**: "If subject wrong, max 0.5"
- **Reference variables**: Use `{{prompt}}` for context

### Negative Testing

Verify your rubrics catch content mismatches by testing prompts that intentionally violate criteria:

```yaml
tests:
  # Generate a red panda, but require a cat
  - vars:
      prompt: Cartoon red panda at a laptop
    assert:
      - type: video-rubric
        threshold: 0.7
        value: |
          This video MUST show a CAT (not a panda).
          Wrong animal: 0.0
```

The judge correctly scores this 0.0 with reasoning: "fails all criteria: does not show a cat."

## FAQ

### How do I compare Sora vs Veo for prompt adherence?

Add both providers to your config and use a prompt adherence rubric. Run `promptfoo eval` to generate videos from each and score them against the same criteria. See the [Sora vs Veo benchmark example](#sora-vs-veo-benchmark-example) above.

### What is LLM-as-a-judge for video evaluation?

Instead of manually watching videos, you send them to a multimodal LLM (like Gemini) with scoring criteria. The model analyzes the video and returns a numeric score with reasoning. This enables automated, repeatable evaluation.

### How do I evaluate temporal consistency?

Use a rubric that checks for object permanence, color stability, and lighting consistency across frames. See the [Temporal Consistency](#temporal-consistency) template.

### How do I benchmark image-to-video keyframe fidelity?

Configure your provider with a start keyframe image, then use the [Keyframe Fidelity](#keyframe-fidelity) rubric template. The rubric checks that the first frame matches your reference and that subject identity is maintained throughout.

### What thresholds should I use for video evals?

Start with `threshold: 0.7` for initial testing. Tighten to `0.8` for production regression tests. Use `0.6` for exploratory smoke tests. Adjust based on your rubric's scoring granularity.

### How can I reduce the cost of video benchmarking?

Use shorter video durations (5s instead of 20s) during development. Enable caching to avoid regenerating identical prompts. Use Gemini Flash instead of Pro for judging. Run fewer providers in PR checks, full comparisons in scheduled jobs.

### Can I run video evals in CI?

Yes. Set up a GitHub Action or similar workflow that runs `promptfoo eval` with your video config. Set `threshold` values on assertions to fail builds when scores drop below acceptable levels. See [CI/CD Integration](#cicd-integration).

## Next Steps

- **[video-rubric reference](/docs/configuration/expected-outputs/model-graded/video-rubric)**: Full assertion configuration options
- **[OpenAI Sora provider](/docs/providers/openai#video-generation-sora)**: Sora-specific configuration
- **[Google Veo provider](/docs/providers/google#video-generation-models-veo)**: Veo-specific configuration
- **[Amazon Nova Reel provider](/docs/providers/aws-bedrock#amazon-nova-reel-video-generation)**: Nova Reel configuration
- **[Luma Ray provider](/docs/providers/aws-bedrock#luma-ray-2)**: Ray configuration
- **[CI/CD guide](/docs/integrations/ci-cd)**: General CI integration patterns
