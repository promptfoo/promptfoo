# video-rubric (Video Rubric Evaluation)

Demonstrates using `video-rubric` assertion to evaluate generated videos using LLM-as-a-judge.

The `video-rubric` assertion uses a multimodal LLM (Gemini 2.5 Flash by default) to evaluate video outputs against a custom rubric. This is useful for:

- Quality assessment of AI-generated videos
- Checking if generated videos match the prompt
- Evaluating visual content, motion, and scene composition

## Prerequisites

Set the following environment variables:

```bash
export GOOGLE_API_KEY=your-google-api-key  # For video generation (Veo)
export GEMINI_API_KEY=your-gemini-key      # For video evaluation (Gemini 3.0 Flash)
```

## Usage

```bash
npx promptfoo@latest init --example video-rubric
npx promptfoo@latest eval
```

## How it works

1. **Video Generation**: Uses Google Veo to generate videos from text prompts
2. **Validity Check**: The `is-valid-video` assertion ensures a video was produced
3. **Rubric Evaluation**: The `video-rubric` assertion sends the video to Gemini for evaluation

The grading model receives the video and rubric, then returns:

- `pass`: Whether the video meets the rubric criteria
- `score`: A numeric score (0.0 - 1.0)
- `reason`: Explanation of the evaluation
