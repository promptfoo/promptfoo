This example shows a YAML configuration with inline tests.

Run the test suite with:

```bash
npx promptfoo@latest init --example simple-test
# or simply
promptfoo eval
```

Note that you can edit the configuration to use a CSV test input instead. Set
`tests: tests.csv` and try running it again, or run:

```
promptfoo eval --tests tests.csv
```
