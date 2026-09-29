---
sidebar_label: Video Generation
sidebar_position: 68
title: Evaluate AI Video Generation
description: Check generated videos for visible subjects, actions, and motion with video-rubric. Set up generation and grading, inspect scores, and compare model outputs.
---

Use `video-rubric` to check whether a generated video meets written criteria. Start
with a small set of prompts: each test calls a video generator and a grading model.

## Prerequisites

This example uses Google Veo for generation and Gemini for grading. Set
`GOOGLE_API_KEY` or `GEMINI_API_KEY` with access to both models. `GOOGLE_API_KEY`
takes precedence when both are set.

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
          A recognizable cat interacts with yarn indoors.
          Score 1 if the subject and action are clear, 0.5 if the cat is visible
          but does not interact with yarn, and 0 if no cat is visible.
```

```bash
npx promptfoo@latest eval --no-cache -o output.json
```

Inspect the exported results for `success`, `score`, and `error`, as well as the
judge's reason. Review a sample of the videos yourself to check that the judge's
scores match the criteria.

## How Grading Works

The video provider stores the clip, and the assertion reads it through Promptfoo's
managed storage. It sends the video and rubric inline to the judge, then validates
the returned JSON grade. Promptfoo applies a 20 MiB request budget, including
base64 encoding and provider settings. See the [video rubric reference](/docs/configuration/expected-outputs/model-graded/video-rubric#video-size-limits-and-judge-output)
for limits and supported storage.

## Selecting The Judge

The default is Google AI Studio `google:gemini-3.8-flash`. To use Vertex AI instead,
configure its credentials and set the judge explicitly:

```yaml
defaultTest:
  options:
    provider: vertex:gemini-3.8-flash
```

## Comparing Providers

Add video providers to the `providers` list to run each prompt against each model.
Keep the judge, rubric, and threshold fixed across the comparison. Use observable
criteria such as whether a subject remains visible or an action occurs.

## Bedrock Videos

Bedrock video models write their output to S3. Keep `downloadFromS3: true` in the
provider configuration so Promptfoo downloads and stores the generated clip.
If the download is disabled or fails, an S3 URL alone cannot be graded.
See [Bedrock video configuration](/docs/providers/aws-bedrock#amazon-nova-reel-video-generation).

## Rubric Design

Describe what a reviewer should see and explain partial credit. Keep distinct
criteria in separate assertions when you need to diagnose failures. Test a few
known matches and mismatches before comparing a larger set of generations.

## Related Pages

- [Video rubric reference](/docs/configuration/expected-outputs/model-graded/video-rubric)
- [OpenAI video provider](/docs/providers/openai#video-generation-sora)
- [Google AI Studio video provider](/docs/providers/google#video-generation-models-veo)
- [Google Vertex AI video provider](/docs/providers/vertex#video-generation-models)
