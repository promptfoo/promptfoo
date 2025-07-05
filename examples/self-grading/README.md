# self-grading (Self Grading)

You can run this example with:

```bash
npx promptfoo@latest init --example self-grading
```

This example shows how you can have an LLM grade its own output according to predefined expectations.

Identical configurations are provided in `promptfooconfig.js` and `promptfooconfig.yaml`.

Run:

```
promptfoo eval
```

You can also define the tests in a CSV file:

```
promptfoo eval --tests tests.csv
```
