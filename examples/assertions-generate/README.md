# assertion-generate (Assertion Generation Example)

You can run this example with:

```bash
npx promptfoo@latest init --example assertion-scoring-override
```

This example demonstrates valid configs for assertion generation in promptfoo.

1. A promptfoo config with prompts + assertions
2. A promptfoo config with just 1 prompt, and no assertions or test cases

## Getting Started

Try the following options:

Generate initial set of assertions (for a config that has none)

```bash
promptfoo generate assertions --config examples/assertions-generate/promptfooconfig-minimal.yaml -o test.yaml --type llm-rubric
```

Generate missing llm-rubric assertions (for a config that already has some)

```bash
promptfoo generate assertions --config examples/assertions-generate/promptfooconfig.yaml -o test.yaml --type llm-rubric
```
