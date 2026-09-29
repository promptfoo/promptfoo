# video-rubric (Video Rubric Evaluation)

Generate two clips with Google Veo and grade their visible content with Gemini 3.8 Flash.
Each test has a rubric and a minimum score of 0.7.

## Prerequisites

Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` with access to Veo and Gemini.
`GOOGLE_API_KEY` takes precedence when both are set. Running the example makes
paid generation and grading calls.

## Usage

```bash
npx promptfoo@latest init --example video-rubric
npx promptfoo@latest eval --no-cache -o output.json
```

Inspect `success`, `score`, `error`, and the grading reason in the exported results.
The provider stores generated videos locally before grading. The complete grading
request must fit Promptfoo's 20 MiB budget, including base64 encoding and the rubric.
External video URLs and storage adapters without bounded reads cannot be graded.
