---
sidebar_label: Video Rubric
description: 'Evaluate AI-generated videos using LLM-as-a-judge with multimodal models like Gemini'
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

1. Extracts the video from the provider response (supports URLs, base64, and storage references)
2. Converts the video to base64 for inline embedding
3. Sends a multimodal request to the grading model with the video and rubric
4. Parses the JSON response to determine pass/fail and score

The grading model must support video understanding. By default, it uses:

- **Vertex AI credentials**: `gemini-3-flash-preview` (recommended for video analysis)
- **Google AI Studio API key**: `gemini-3-flash-preview`

## Supported video providers

`video-rubric` works with any provider that returns video content:

- `openai:video:sora-2` - OpenAI Sora
- `vertex:video:veo-3.1-generate-preview` - Google Veo
- `bedrock:video:amazon.nova-reel-v1:1` - Amazon Nova Reel
- `bedrock:video:luma.ray-v2:0` - Luma Ray 2 (via AWS Bedrock)
- `azure:video:sora` - Azure AI Foundry Sora

## Overriding the grading provider

You can specify a different multimodal model for grading:

```yaml
assert:
  - type: video-rubric
    value: Does the video show smooth motion without artifacts?
    provider: vertex:gemini-3-pro-preview
```

Or set a default grading provider for all tests:

```yaml
defaultTest:
  options:
    provider:
      id: vertex:gemini-3-flash-preview
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

## Video size limits

Videos up to 20MB can be sent inline. Larger videos will fail with a size limit error. Support for the Gemini File API (for larger videos) is planned for a future release.

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
    provider: vertex:gemini-3-flash-preview

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

- A multimodal model that supports video understanding (Gemini 2.5 Flash/Pro recommended)
- For Vertex AI: `GOOGLE_PROJECT_ID` environment variable and application default credentials
- For AI Studio: `GEMINI_API_KEY` or `GOOGLE_API_KEY` environment variable

## Further reading

- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) for other LLM-as-judge options
- [Video providers](/docs/providers/openai#video-generation-sora) for generating videos
