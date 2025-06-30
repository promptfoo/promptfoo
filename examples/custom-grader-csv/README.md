# custom-grader-csv (Custom Grader Csv)

You can run this example with:

```bash
npx promptfoo@latest init --example custom-grader-csv
```

This example uses a custom assertion in `customAssertion.ts` and reads test cases from `tests.csv`.
The `__expected` column in `tests.csv` points to this assertion script.

Run:

```
promptfoo eval
```

Full command-line equivalent:

```
promptfoo eval --prompts prompts.txt --tests tests.csv --providers openai:gpt-4.1-mini --output output.json
```
