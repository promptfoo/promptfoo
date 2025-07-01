# Dataset Plugin Namespacing Example

This example demonstrates the dataset plugin namespacing feature in promptfoo's red teaming functionality.

## Background

Dataset plugins in promptfoo (such as BeaverTails, HarmBench, CyberSecEval, etc.) can now be referenced using a namespaced format with the `dataset:` prefix. This helps distinguish dataset-based plugins from other types of plugins.

## Supported Syntax

Both legacy and new syntax are supported:

| Legacy Name    | New Namespaced Name    |
| -------------- | ---------------------- |
| `aegis`        | `dataset:aegis`        |
| `beavertails`  | `dataset:beavertails`  |
| `cyberseceval` | `dataset:cyberseceval` |
| `donotanswer`  | `dataset:donotanswer`  |
| `harmbench`    | `dataset:harmbench`    |
| `toxic-chat`   | `dataset:toxic-chat`   |
| `pliny`        | `dataset:pliny`        |
| `unsafebench`  | `dataset:unsafebench`  |
| `xstest`       | `dataset:xstest`       |

## Backward Compatibility

The legacy names continue to work and are automatically aliased to the new namespaced format. This ensures existing configurations remain functional without any changes.

## Example Usage

See `promptfooconfig.yaml` for examples of:

- Using legacy plugin names
- Using new namespaced names
- Mixing both syntaxes in the same configuration
- Configuring plugins with additional options

## Running the Example

```bash
# Run the red team evaluation
npx promptfoo@latest redteam run

# View the results
npx promptfoo@latest view
```

## Best Practice

While both syntaxes work, we recommend using the new `dataset:` prefix for clarity and consistency in new configurations.
