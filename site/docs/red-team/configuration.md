---
sidebar_position: 2
sidebar_label: 'Configuration'
---

# Redteam Configuration

The `redteam` section in your `promptfoo.config.yaml` file is optional and only applicable when generating redteam tests via `promptfoo generate redteam`. It offers more configuration options, as well as the convenience of checking the configuration into your repository to track changes and share with others.

## Getting Started

To initialize a basic redteam configuration, run:

```bash
npx promptfoo@latest redteam init
```

## Configuration Structure

The following YAML structure outlines the configuration options available for red teaming:

```yaml
redteam:
  plugins: Array<string | { id: string, numTests?: number }>
  strategies: Array<string | { id: string }>
  numTests: number # default number of tests to generate per plugin
  injectVar: string # variable to inject
  provider: string # test generation provider
  purpose: string # purpose override string

# Note that prompts and providers are still necessary for the generation of adversarial inputs.
prompts:
 - 'You are a helpful assistant that can answer questions. Answer in a friendly manner: {{question}}'
providers:
 - openai:gpt-4o-mini
```

### Fields

| Field        | Type                                                    | Description                                                                                                      | Default                        |
| ------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `injectVar`  | `string`                                                | Variable to inject adversarial inputs into.                                                                      | Inferred from prompts          |
| `numTests`   | `number`                                                | Default number of tests to generate per plugin. Can be overridden for individual plugins.                        | 5                              |
| `plugins`    | `string[]` &#124; `{ id: string, numTests?: number }[]` | Plugins to use for redteam generation. Can be specified as strings or objects with optional `numTests` property. | Many common plugins            |
| `provider`   | `string`                                                | AI model provider used for generating adversarial inputs. Can differ from the model being tested.                | Inferred from `providers` list |
| `purpose`    | `string`                                                | A description of the prompt templates' purpose to guide the generation of adversarial inputs.                    | None                           |
| `strategies` | `string[]` &#124; `{ id: string }[]`                    | Strategies to apply to other plugins, generating additional test cases based on plugin outputs.                  | jailbreak and prompt-injection |

## Plugins

Plugins are specified as an array of either strings (plugin IDs) or objects with `id` and optional `numTests` properties. They must exactly match the plugin IDs available in the redteam system.

### Plugin Specification

- **As a string**: `"plugin-id"`
- **As an object**: `{ id: "plugin-id", numTests: 10 }`

If `numTests` is not specified for a plugin, it will use the global `numTests` value.

### Core Concepts

There are three core concepts that affect the number of generated redteam tests: individual plugins, collections of related plugins, and strategies.

#### Plugins

- `overreliance`
- `hijacking`
  ...

#### Plugin Collections

- `harmful`: Automatically includes all available harm plugins.
- `pii`: Automatically includes all available PII plugins.

Run the CLI menu `promptfoo generate redteam --help` to see a complete list of available plugins.

#### Available Harm Plugins

Many of these plugins are derived from [MLCommons Harm Categories](https://arxiv.org/abs/2404.12241) or [Harmbench](https://github.com/centerforaisafety/HarmBench). Examples include:

- `harmful:chemical-biological-weapons`: Chemical & Biological Weapons
- `harmful:child-exploitation`: Child Exploitation
- `harmful:copyright-violations`: Copyright Violations
- `harmful:cybercrime`: Cybercrime & Unauthorized Intrusion
- `harmful:graphic-content`: Graphic & age-restricted content
- `harmful:harassment-bullying`: Harassment & Bullying
- `harmful:hate`: Hate
- `harmful:illegal-activities`: Illegal Activities
- `harmful:illegal-drugs`: Illegal Drugs
- `harmful:indiscriminate-weapons`: Indiscriminate Weapons
- `harmful:insults`: Insults and personal attacks
- `harmful:intellectual-property`: Intellectual Property violation
- `harmful:misinformation-disinformation`: Misinformation & Disinformation
- `harmful:non-violent-crime`: Non-Violent Crimes
- `harmful:privacy`: Privacy violations
- `harmful:profanity`: Requests containing profanity
- `harmful:radicalization`: Radicalization
- `harmful:self-harm`: Self-Harm
- `harmful:sex-crime`: Sex Crimes
- `harmful:sexual-content`: Sexual Content
- `harmful:specialized-advice`: Specialized Advice
- `harmful:unsafe-practices`: Promotion of unsafe practices
- `harmful:violent-crime`: Violent Crimes

#### Available PII (Personally Identifiable Information) Plugins

- `pii:api-db`: Ensures the model does not attempt to access APIs or databases to retrieve PII.
- `pii:direct`: Tests if the model directly discloses PII when explicitly asked.
- `pii:session`: Ensures the model does not leak PII across different user sessions or interactions.
- `pii:social`: Tests if the model can be manipulated into revealing PII through social engineering tactics.

## Strategies

Strategies modify or generate additional test cases based on the output of other plugins.

### Available Strategies

- `jailbreak`: Generates jailbreak attempts for harmful prompts. If `harmful` plugins are not present, this strategy will automatically include them.
- `prompt-injection`: Creates prompt injection test cases based on harmful prompts. If `harmful` plugins are not present, this strategy will automatically include them.
- `experimental-jailbreak`: Applies experimental jailbreak techniques to all test cases, not just harmful ones.

### Strategies Specification

- **As a string**: `"jailbreak"`
- **As an object**: `{ id: "prompt-injection" }`

### Special Handling for Strategies

1. When a strategy is included, it automatically adds its required plugins if they're not already present.
2. Strategies are applied after all regular plugins have generated their test cases.
3. Strategies do not support `numTests` at this time. The number of additional test cases generated by a strategy varies depending on the specific strategy and the number of test cases generated by the plugins it modifies.

## Example Configurations

### Basic Configuration

```yaml
redteam:
  numTests: 10
  plugins:
    - 'harmful:hate'
    - 'competitors'
  strategies:
    - 'jailbreak'
```

### Advanced Configuration

```yaml
redteam:
  injectVar: 'user_input'
  purpose: 'Evaluate chatbot safety and robustness'
  provider: 'openai:chat:gpt-4o-mini'
  numTests: 20
  plugins:
    - id: 'harmful:child-exploitation'
      numTests: 15
    - id: 'harmful:copyright-violations'
      numTests: 10
    - id: 'competitors'
    - id: 'overreliance'
  strategies:
    - id: 'jailbreak'
```

## Notes

1. Duplicate plugins are removed, keeping the last occurrence.
2. Plugins are sorted alphabetically in the final configuration.
3. The global `numTests` value is used as a default for plugins that don't specify their own `numTests`.
4. The `injectVar` field is a string denoting the `{{variable}}` (without curly braces) used to inject adversarial inputs into the prompts.
5. The `provider` field allows you to specify which AI model to use for generating adversarial inputs. This can be different from the model you're testing.
6. The `purpose` field helps guide the generation of adversarial inputs by providing context about your application.

## Best Practices

1. Start with a configuration created by `promptfoo redteam init`
2. Remove the plugins that are not relevant to your use case.
3. Adjust `numTests` for individual plugins based on their importance to your use case.
4. Run a redteam evaluation and see how well you perform. Generate additional tests as needed.
