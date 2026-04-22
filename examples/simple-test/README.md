# simple-test (Simple Test)

You can run this example with:

```bash
npx promptfoo@latest init --example simple-test
cd simple-test
```

## Usage

This example shows a YAML configuration with inline tests.

Run the test suite with:

```bash
promptfoo eval
```

Note that you can edit the configuration to use a CSV test input instead. Set
`tests: tests.csv` and try running it again, or run:

```bash
promptfoo eval --tests tests.csv
```
