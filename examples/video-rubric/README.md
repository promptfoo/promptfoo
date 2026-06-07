# video-rubric (Video Rubric Evaluation)

Demonstrates using `video-rubric` assertion to evaluate generated videos using LLM-as-a-judge.

The `video-rubric` assertion uses Google AI Studio Gemini 3.5 Flash by default to evaluate video outputs against a custom rubric. This is useful for:

- Quality assessment of AI-generated videos
- Checking if generated videos match the prompt
- Evaluating visual content, motion, and scene composition

## Prerequisites

Set a Google AI Studio API key. The same credential is used for both Veo generation and Gemini
grading:

```bash
export GOOGLE_API_KEY=your-google-api-key
```

`GEMINI_API_KEY` is also supported as a fallback. If both variables are set,
`GOOGLE_API_KEY` takes precedence.

## Usage

```bash
npx promptfoo@latest init --example video-rubric
npx promptfoo@latest eval
```

## How it works

1. **Video Generation**: Uses Google Veo to generate videos from text prompts
2. **Managed Video Asset**: The video provider stores the generated video for grading
3. **Rubric Evaluation**: The `video-rubric` assertion sends the video to Gemini for evaluation

The assertion grades Promptfoo-managed video assets. Built-in video providers store generated
media before grading; for Bedrock providers, keep `downloadFromS3` enabled.

The grading model receives the video and rubric, then returns:

- `pass`: Whether the video meets the rubric criteria
- `score`: A numeric score (0.0 - 1.0)
- `reason`: Explanation of the evaluation
