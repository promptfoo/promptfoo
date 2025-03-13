# Custom Red Team Strategy Example

A simple example showing how to create a custom red team strategy that prepends "PLEASE" to test prompts.

## Usage

The example is configured in `promptfooconfig.yaml` and uses:

- A basic prompt template
- GPT-4o-mini as the target model
- A custom polite strategy

Run the evaluation:

```bash
promptfoo eval
```

View results:

```bash
promptfoo view
```

For more details on custom strategies, check out the [docs](https://www.promptfoo.dev/docs/red-team/strategies/custom/).
