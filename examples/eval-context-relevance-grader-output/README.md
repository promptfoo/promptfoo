# eval-context-relevance-grader-output (Context Relevance Grader Output)

This example shows how `context-relevance` stores the raw judge response in
assertion metadata so it can be inspected in View.

## Run

Run it with:

```bash
npx promptfoo@latest init --example eval-context-relevance-grader-output
cd eval-context-relevance-grader-output
npx promptfoo@latest eval --no-cache
npx promptfoo@latest view
```

## Inspect

Open a row's details and select the Evaluation tab. The Reason column includes
the score explanation plus the judge response under "Grader output".
