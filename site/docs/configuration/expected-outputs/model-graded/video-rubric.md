---
title: Video Rubric
sidebar_label: Video Rubric
description: 'Score AI-generated videos with secure multimodal rubric grading, explicit thresholds, and managed media from Sora, Veo, Azure, xAI, or Bedrock providers.'
---

# Video Rubric

`video-rubric` evaluates AI-generated videos using multimodal LLMs. It sends the video content to a vision-capable model (like Gemini) along with your rubric criteria to assess video quality, content accuracy, and other attributes.

## How to use it

Add the `video-rubric` assertion to evaluate video outputs:

```yaml
providers:
  - openai:video:sora-2

tests:
  - vars:
      prompt: A golden retriever running on a beach at sunset
    assert:
      - type: video-rubric
        value: |
          Evaluate the video based on the following criteria:
          1. Subject: A dog (golden retriever or similar) should be visible
          2. Setting: Beach or shoreline with ocean/waves visible
          3. Motion: The dog should be running or moving
          4. Lighting: Warm sunset colors should be present
          Score 1.0 if all criteria are met, 0.5 if partially met, 0.0 if none are met.
```

## How it works

Under the hood, `video-rubric`:

1. Reads the video from Promptfoo-managed blob or media storage references in the provider response
2. Converts the video to base64 for inline embedding
3. Sends a multimodal request to the grading model with the video and rubric
4. Validates the JSON response to determine pass/fail and a score between 0.0 and 1.0

For security, `video-rubric` does not fetch external video URLs during grading. Built-in video
providers store the generated video before returning it; Bedrock providers must retain their
default `downloadFromS3: true` setting when used with this assertion.

The grading model must support video understanding. By default, it uses Google AI Studio
`google:gemini-3.5-flash` with `GOOGLE_API_KEY` (preferred) or `GEMINI_API_KEY`. If both
variables are set, `GOOGLE_API_KEY` takes precedence. To use Vertex AI, configure
`vertex:gemini-3.5-flash` explicitly.

## Supported video providers

`video-rubric` works with any provider that returns video content:

- `openai:video:sora-2` - OpenAI Sora
- `google:video:veo-3.1-generate-preview` - Google Veo through AI Studio
- `vertex:video:veo-3.1-generate-preview` - Google Veo
- `bedrock:video:amazon.nova-reel-v1:1` - Amazon Nova Reel
- `bedrock:video:luma.ray-v2:0` - Luma Ray 2 (via AWS Bedrock)
- `azure:video:sora` - Azure AI Foundry Sora
- `xai:video:grok-imagine-video` - xAI Grok Imagine Video

## Overriding the grading provider

You can specify a different multimodal model for grading:

```yaml
assert:
  - type: video-rubric
    value: Does the video show smooth motion without artifacts?
    provider: vertex:gemini-3.5-flash
```

Or set a default grading provider for all tests:

```yaml
defaultTest:
  options:
    provider:
      id: vertex:gemini-3.5-flash
      config:
        generationConfig:
          response_mime_type: application/json
```

## Using variables in the rubric

Incorporate test variables to create dynamic rubrics:

```yaml
tests:
  - vars:
      prompt: A cat playing with yarn
      expected_subject: cat
      expected_action: playing with yarn
    assert:
      - type: video-rubric
        value: |
          The video should show a {{expected_subject}} that is {{expected_action}}.
          Score 1.0 if the subject and action match, 0.0 otherwise.
```

## Video size limits and judge output

[Gemini inline video requests](https://ai.google.dev/gemini-api/docs/video-understanding#pass-video-data-inline)
have a 20MB total request budget. Video bytes are base64-encoded and the rubric also counts
toward that budget, so usable video files must be smaller than 15MB. Larger payloads fail with a
size limit error; Gemini File API support is planned for a future release.

The judge response must contain a boolean `pass` and a numeric `score` from `0.0` to `1.0`.
Malformed or out-of-range judge responses fail rather than being interpreted as successful
grades.

## Threshold support

Set a minimum score requirement:

```yaml
assert:
  - type: video-rubric
    value: |
      Evaluate video quality on a scale of 0-1:
      - 1.0: Excellent quality, no artifacts
      - 0.5: Acceptable quality, minor issues
      - 0.0: Poor quality, major artifacts
    threshold: 0.7
```

## Example configuration

Complete example evaluating video generation:

```yaml title="promptfooconfig.yaml"
description: Video generation evaluation

prompts:
  - '{{prompt}}'

providers:
  - id: openai:video:sora-2
    config:
      size: '1280x720'
      seconds: 4

defaultTest:
  options:
    provider: vertex:gemini-3.5-flash

tests:
  - vars:
      prompt: Ocean waves rolling onto a sandy beach with palm trees
    assert:
      - type: video-rubric
        value: |
          Evaluate the video:
          1. Scene shows beach with ocean waves
          2. Palm trees are visible
          3. Motion is smooth and natural
          4. No visual artifacts or distortion
          Return pass: true if criteria are met, score 0-1 based on quality.
```

## Requirements

- A multimodal model that supports video understanding (Gemini 3.5 Flash supported)
- Promptfoo-managed video storage; external URLs are not downloaded for grading
- For Vertex AI: `GOOGLE_PROJECT_ID` environment variable and application default credentials
- For AI Studio: `GOOGLE_API_KEY` (preferred) or `GEMINI_API_KEY` environment variable

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) for other LLM-as-judge options
- [Video providers](/docs/providers/openai#video-generation-sora) for generating videos
