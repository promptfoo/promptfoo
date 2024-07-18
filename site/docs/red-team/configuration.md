# Redteam Configuration

The `redteam` section in your `promptfooconfig.yaml` file allows you to configure red teaming options for your prompts. To get started, run `npx promptfoo@latest redteam init` and follow the prompts to generate a basic configuration.

## Configuration Structure

```yaml
redteam:
  injectVar: string | string[]
  numTests: number
  plugins: Array<string | { name: string, numTests?: number }>
  provider: string
  purpose: string
```

## Fields

| Field       | Type               | Description                                              | Default               |
| ----------- | ------------------ | -------------------------------------------------------- | --------------------- |
| `injectVar` | string \| string[] | Variable(s) to inject.                                   | Inferred from prompts |
| `purpose`   | string             | Purpose override string describing the prompt templates. | Optional              |
| `provider`  | string             | Provider used for generating adversarial inputs.         | Optional              |
| `numTests`  | number             | Default number of tests to generate per plugin.          | 5                     |
| `plugins`   | array              | Plugins to use for redteam generation.                   | Default plugins       |

## Plugins

Plugins are specified as an array of either strings (plugin names) or objects with `name` and optional `numTests` properties. They must exactly match the plugin names available in the redteam system.

### Plugin Specification

- As a string: `"plugin-name"`
- As an object: `{ name: "plugin-name", numTests: 10 }`

If `numTests` is not specified for a plugin, it will use the global `numTests` value.

### Available Plugins

Run the help menu to see a complete list of available plugins. Some common plugins include:

- `jailbreak`
- `prompt-injection`
- `harmful:hate`
- `harmful:violent-crime`
- `competitors`
- `overreliance`

## Special Handling for 'harmful' Plugin

The `harmful` and `pii` plugins are special cases that expand into multiple specific harm categories. When you include `harmful` or `pii` in your plugins list, it will automatically include all available sub-categories.

## Methods

Methods are special plugins that modify or generate additional test cases based on the output of other plugins. They can be included in the `plugins` array just like regular plugins.

### Available Methods

- `jailbreak`: Generates jailbreak attempts for harmful prompts. If `harmful` plugins are not present, this method will automatically include them.
- `prompt-injection`: Creates prompt injection test cases based on harmful prompts. If `harmful` or `pii` plugins are not present, this method will automatically include them.
- `experimental-jailbreak`: Applies experimental jailbreak techniques to all test cases, not just harmful ones.

### Method Specification

Methods can be specified in the same way as regular plugins:

- As a string: `"jailbreak"`
- As an object: `{ name: "prompt-injection", numTests: 10 }`

### Special Handling for Methods

1. When a method is included in the plugins list, it automatically adds its required plugins if they're not already present.
2. Methods are applied after all regular plugins have generated their test cases.
3. The `numTests` value for a method is ignored.

## Example Configurations

### Basic Configuration

```yaml
redteam:
  numTests: 10
  plugins:
    - 'jailbreak'
    - 'harmful:hate'
    - 'competitors'
```

### Advanced Configuration

```yaml
redteam:
  injectVar: ['user_input', 'system_prompt']
  purpose: 'Evaluate chatbot safety and robustness'
  provider: 'anthropic:claude-3-opus-20240229'
  numTests: 20
  plugins:
    - name: 'jailbreak'
      numTests: 15
    - name: 'harmful:child-exploitation'
    - name: 'harmful:copyright-violations'
      numTests: 10
    - name: 'competitors'
    - name: 'overreliance'
```

## Notes

1. The `harmful` plugin expands to include all harm categories. You can override specific harm categories by explicitly including them in the plugins list.
2. Duplicate plugins are removed, keeping the last occurrence.
3. Plugins are sorted alphabetically in the final configuration.
4. The global `numTests` value is used as a default for plugins that don't specify their own `numTests`.
5. The `injectVar` field can be a single string or an array of strings, depending on how many variables you want to inject adversarial inputs into. Currently, we only support injecting a single variable, but this will change in the future.
6. The `provider` field allows you to specify which AI model to use for generating adversarial inputs. This can be different from the model you're testing.
7. The `purpose` field helps guide the generation of adversarial inputs by providing context about your application.

## Best Practices

1. Start with a basic configuration.
2. Remove the plugins that are not relevant to your use case.
3. Adjust `numTests` for individual plugins based on their importance to your use case.
4. Run a redteam evaluation and see how well you perform. Generate additional tests as needed.
