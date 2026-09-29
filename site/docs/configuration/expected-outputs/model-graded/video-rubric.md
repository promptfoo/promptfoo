---
sidebar_label: Video rubric
title: Video rubric
description: Grade generated videos against a written rubric with a video-capable model. Configure the judge and score threshold, and understand managed storage and size limits.
---

`video-rubric` sends a generated video and your rubric to a video-capable grading model.
Use it to check visible subjects, actions, motion, or artifacts.

## Basic usage

```yaml
assert:
  - type: video-rubric
    value: A red bicycle stays visible as it moves through the scene.
    threshold: 0.8
```

The default judge is Google AI Studio `google:gemini-3.8-flash`. Set `GOOGLE_API_KEY`
or `GEMINI_API_KEY`; `GOOGLE_API_KEY` takes precedence when both are set.

## Supported video providers

The assertion requires a managed `blobRef` or `storageRef` in the provider's `video`
response. Built-in video providers can store generated media locally for grading.
For Bedrock video providers, keep `downloadFromS3` enabled.

External video URLs, including S3 and cloud-storage URLs, are not downloaded by the
assertion. Custom storage adapters must implement the optional bounded-read capability
(`getByHashBounded` for blobs or `retrieveBounded` for media). An adapter without that
capability produces a grading error; the assertion does not fall back to an unbounded read.

## Overriding the grading provider

Choose a video-capable Google AI Studio or Vertex AI model:

```yaml
assert:
  - type: video-rubric
    value: The bicycle wheels rotate while the bicycle moves forward.
    provider: vertex:gemini-3.8-flash
```

To use the same judge for all model-graded assertions:

```yaml
defaultTest:
  options:
    provider: vertex:gemini-3.8-flash
```

Vertex AI requires a configured Google project and credentials. See the
[Vertex AI provider setup](/docs/providers/vertex).

## Using variables in the rubric

```yaml
tests:
  - vars:
      prompt: A cat playing with yarn
      expected_subject: cat
    assert:
      - type: video-rubric
        value: A {{expected_subject}} interacts with a ball of yarn.
```

## Video size limits and judge output

Promptfoo applies a conservative **20 MiB request budget** for inline video grading.
This includes base64 encoding, the rubric, and the final Google request body. The
video alone must be smaller than 15 MiB, with room left for the prompt and provider
settings. Oversized files are rejected before an unbounded read. Files API uploads
are not supported by this assertion.

The judge should return one JSON object:

```json
{ "pass": true, "score": 0.9, "reason": "The bicycle stays visible and its wheels rotate." }
```

The score must be finite and between 0 and 1. Malformed JSON, missing grades, and
out-of-range scores produce grading failures. A single Markdown JSON fence is accepted.

## Threshold support

An assertion passes when the judge passes it and its score meets the threshold:

```yaml
assert:
  - type: video-rubric
    value: The bicycle remains recognizable throughout the clip, without visible deformation.
    threshold: 0.8
```

Use `not-video-rubric` to invert a valid grade. Grading errors remain failures.

## Example configuration

See the [video-rubric example](https://github.com/promptfoo/promptfoo/tree/main/examples/video-rubric)
and the [video evaluation guide](/docs/guides/evaluate-video) for runnable configurations.

## Requirements

- A judge that accepts Google's inline video message format
- A managed video in storage that supports bounded reads
- Credentials for generation and grading

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded)
- [Google video generation](/docs/providers/google#video-generation-models-veo)
