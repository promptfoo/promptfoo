---
sidebar_label: Video Generation
title: Evaluate AI Video Generation
description: 'Compare Sora, Veo, Nova Reel, and Luma Ray video generations with secure multimodal rubric scoring, repeatable evaluations, and practical provider setup.'
keywords:
  - ai video generation
  - video evaluation
  - sora
  - veo
  - amazon nova reel
  - luma ray
  - video rubric
---

Use `video-rubric` to evaluate generated videos with a multimodal judge. This is useful for
prompt adherence, visible artifacts, motion quality, and regressions across model or prompt
changes.

## Prerequisites

Set credentials for the video provider you plan to run:

| Provider                  | Promptfoo ID                            | Credentials and setup                                  |
| ------------------------- | --------------------------------------- | ------------------------------------------------------ |
| OpenAI Sora               | `openai:video:sora-2`                   | `OPENAI_API_KEY`                                       |
| Google Veo with AI Studio | `google:video:veo-3.1-generate-preview` | `GEMINI_API_KEY` or `GOOGLE_API_KEY`                   |
| Google Veo with Vertex AI | `vertex:video:veo-3.1-generate-preview` | Vertex project and application default credentials     |
| Amazon Nova Reel          | `bedrock:video:amazon.nova-reel-v1:1`   | AWS credentials, model access, and an S3 output bucket |
| Luma Ray on Bedrock       | `bedrock:video:luma.ray-v2:0`           | AWS credentials, model access, and an S3 output bucket |

The default judge is Google AI Studio `google:gemini-3.5-flash`, which requires
`GEMINI_API_KEY` or `GOOGLE_API_KEY`. To grade through Vertex AI instead, configure a Vertex
Gemini provider explicitly.

## First Evaluation

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{prompt}}'

providers:
  - id: google:video:veo-3.1-generate-preview
    config:
      aspectRatio: '16:9'
      durationSeconds: 6

tests:
  - vars:
      prompt: A cat playing with a ball of yarn on a living room floor
    assert:
      - type: video-rubric
        threshold: 0.7
        value: |
          The video should show a cat interacting with yarn or a ball indoors.
          Motion should be smooth and the subject should remain recognizable.
          Score from 0.0 to 1.0 based on how fully these criteria are met.
```

```bash
promptfoo eval --no-cache -o output.json
```

Inspect `output.json` for the assertion score and judge reason. Video generation can be slow and
costly, so start with a small prompt set before expanding a comparison.

## How Grading Works

For each `video-rubric` assertion, Promptfoo:

1. Reads video bytes from the provider's Promptfoo-managed `blobRef` or `storageRef`.
2. Rejects external video URLs rather than downloading provider-controlled locations during grading.
3. Sends the base64-encoded video and rubric inline when they fit Gemini's 20 MB request budget.
4. Requires the judge to return JSON with `pass`, `score`, and optionally `reason`.

The `score` must be a finite number from `0.0` to `1.0`, and malformed responses fail the
assertion. A `threshold` applies after the judge response is validated.

## Selecting The Judge

Override the judge per assertion:

```yaml
assert:
  - type: video-rubric
    provider: vertex:gemini-3.5-flash
    threshold: 0.8
    value: The video has stable motion and contains no visible text artifacts.
```

Or apply it to all model-graded assertions in the evaluation:

```yaml
defaultTest:
  options:
    provider: vertex:gemini-3.5-flash
```

Use a judge model that accepts video input and produces structured JSON responses.

## Comparing Providers

You can run the same prompt and rubric across providers:

```yaml
prompts:
  - '{{prompt}}'

providers:
  - id: openai:video:sora-2
    config:
      size: '1280x720'
      seconds: 4
  - id: vertex:video:veo-3.1-generate-preview
    config:
      aspectRatio: '16:9'
      durationSeconds: 6

tests:
  - vars:
      prompt: Ocean waves rolling onto a sandy beach at sunset
    assert:
      - type: video-rubric
        threshold: 0.7
        value: |
          The video shows moving ocean waves at a beach during sunset.
          Score lower for flicker, geometry errors, or abrupt motion changes.
```

Use `repeat` when generation variance matters:

```yaml
defaultTest:
  options:
    repeat: 3
```

Each generation is scored independently; compare the individual results rather than treating
repeated generations as a single averaged sample.

## Bedrock Videos

Nova Reel and Luma Ray write generated files to S3, then the Promptfoo providers can download and
store them for assertions. Keep `downloadFromS3` enabled when using `video-rubric`:

```yaml
providers:
  - id: bedrock:video:amazon.nova-reel-v1:1
    config:
      region: us-east-1
      s3OutputUri: s3://your-bucket/nova-reel-output/
      downloadFromS3: true
      durationSeconds: 6
  - id: bedrock:video:luma.ray-v2:0
    config:
      region: us-west-2
      s3OutputUri: s3://your-bucket/luma-output/
      downloadFromS3: true
      duration: '5s'
      resolution: '720p'
      aspectRatio: '16:9'
```

If S3 download is disabled or fails, generation output may still reference S3, but
`video-rubric` cannot grade that external location.

## Rubric Design

Good video rubrics describe observable evidence and assign a score consistently:

```yaml
- type: video-rubric
  threshold: 0.75
  value: |
    Required evidence:
    - A red bicycle remains visible while moving through the scene.
    - Wheels rotate naturally and the frame does not visibly deform.
    Scoring:
    - 1.0: Both requirements are clear with no material artifacts.
    - 0.5: Correct subject but noticeable motion or shape artifacts.
    - 0.0: Wrong subject or no recognizable motion.
```

Keep one visual concern per assertion when diagnosing failures, and use negative tests to confirm
the judge distinguishes a deliberate mismatch.

## Related Pages

- [Video rubric reference](/docs/configuration/expected-outputs/model-graded/video-rubric)
- [OpenAI video provider](/docs/providers/openai#video-generation-sora)
- [Google AI Studio video provider](/docs/providers/google#video-generation-models-veo)
- [Google Vertex AI video provider](/docs/providers/vertex#video-generation-models)
- [AWS Bedrock video providers](/docs/providers/aws-bedrock#amazon-nova-reel-video-generation)
