# google-decisions (Gemini Decisions API)

Evaluate two camera inspection reports with `gemini-decision-1`. Each request asks whether the camera is damaged (`noul`), where it should go (`choice`), and how severely its function is impaired (`score`).

## Run the example

Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` to your Gemini Developer API key, then run the example.

```sh
npx promptfoo@latest init --example google-decisions
cd google-decisions
npx promptfoo@latest eval --no-cache -o results.json
```

The JavaScript assertions access each answer by its configured question ID. For example, `output.disposition.choice` should be `repair` for the shattered lens and `stock` for the camera that passed inspection. Open `results.json` to see each answer's confidence and the distributions for the choice and score questions.

See the [Google provider documentation](https://www.promptfoo.dev/docs/providers/google/#gemini-decisions-api).
