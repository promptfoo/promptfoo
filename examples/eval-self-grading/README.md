# eval-self-grading (Self Grading)

You can run this example with:

```bash
npx promptfoo@latest init --example eval-self-grading
cd eval-self-grading
```

## Usage

This example shows how you can have an LLM grade its own output according to predefined expectations.

The configuration is provided in `promptfooconfig.yaml`.

Run:

```bash
promptfoo eval
```

You can also define the tests in a CSV file:

```bash
promptfoo eval --tests tests.csv
```
