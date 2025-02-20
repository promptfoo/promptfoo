# Assertion Scoring Function Override Example

This example demonstrates different ways to define and override the default scoring function in promptfoo. It shows three patterns for implementing and referencing scoring functions:

1. A global override in the `defaultTest` section of the config
2. A named export in a JavaScript file
3. A Python function export in a Python file

## Getting Started

Initialize the example:

```bash
npx promptfoo@latest init --example assertion-scoring-override
```

Run the evaluation:

```bash
cd assertion-scoring-override
promptfoo eval
```

View the results:

```bash
promptfoo view
```
