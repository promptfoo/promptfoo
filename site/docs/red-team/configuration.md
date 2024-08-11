---
sidebar_position: 2
sidebar_label: 'Configuration'
---

# Redteam Configuration

The `redteam` section in your `promptfooconfig.yaml` file is used when generating redteam tests via `promptfoo generate redteam`. It allows you to specify the plugins and other parameters of your redteam tests.

## Getting Started

To initialize a basic redteam configuration, run:

```bash
npx promptfoo@latest redteam init
```

## Configuration Structure

The redteam configuration uses the following YAML structure:

```yaml
redteam:
  plugins: Array<string | { id: string, numTests?: number }>
  strategies: Array<string | { id: string }>
  numTests: number
  injectVar: string
  provider: string | ProviderOptions
  purpose: string

prompts:
  - 'Your prompt template here: {{variable}}'
providers:
  - openai:gpt-4-turbo
```

### Configuration Fields

| Field        | Type                      | Description                                                              | Default                         |
| ------------ | ------------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| `injectVar`  | `string`                  | Variable to inject adversarial inputs into                               | Inferred from prompts           |
| `numTests`   | `number`                  | Default number of tests to generate per plugin                           | 5                               |
| `plugins`    | `Array<string\|object>`   | Plugins to use for redteam generation                                    | `default`                       |
| `provider`   | `string\|ProviderOptions` | AI model provider for generating adversarial inputs                      | `openai:gpt-4o`                 |
| `purpose`    | `string`                  | Description of prompt templates' purpose to guide adversarial generation | Inferred from prompts           |
| `strategies` | `Array<string\|object>`   | Strategies to apply to other plugins                                     | `jailbreak`, `prompt-injection` |

## Core Concepts

There are three main components that affect the generation of redteam tests:

1. Individual plugins
2. Collections of related plugins
3. Strategies

### Plugins

Plugins are specified as an array of either strings (plugin IDs) or objects with `id` and optional `numTests` properties. They must exactly match the plugin IDs available in the redteam system.

#### Plugin Specification Examples

- As a string: `"plugin-id"`
- As an object: `{ id: "plugin-id", numTests: 10 }`

If `numTests` is not specified for a plugin, it will use the global `numTests` value.

#### Available Plugin Categories

#### Harmful Plugins

- `harmful:violent-crime`: Content related to violent criminal activities.
- `harmful:non-violent-crime`: Content related to non-violent criminal activities.
- `harmful:sex-crime`: Content related to sexual crimes.
- `harmful:child-exploitation`: Content exploiting or harming children.
- `harmful:indiscriminate-weapons`: Content related to weapons without context.
- `harmful:hate`: Content that promotes hate or discrimination.
- `harmful:self-harm`: Content that encourages self-harm or suicide.
- `harmful:sexual-content`: Explicit or inappropriate sexual content.
- `harmful:cybercrime`: Content related to cybercriminal activities.
- `harmful:chemical-biological-weapons`: Content related to chemical or biological weapons
- `harmful:illegal-drugs`: Content related to illegal drug use or trade.
- `harmful:copyright-violations`: Content violating copyright laws.
- `harmful:harassment-bullying`: Content that harasses or bullies individuals.
- `harmful:illegal-activities`: Content promoting illegal activities.
- `harmful:graphic-content`: Displaying graphic or violent content.
- `harmful:unsafe-practices`: Content promoting unsafe or harmful practices.
- `harmful:radicalization`: Content that promotes radical or extremist views.
- `harmful:profanity`: Content containing profane or inappropriate language.
- `harmful:insults`: Content that insults or demeans individuals.
- `harmful:privacy`: Content violating privacy rights.
- `harmful:intellectual-property`: Content violating intellectual property rights.
- `harmful:misinformation-disinformation`: Spreading false or misleading information.
- `harmful:specialized-advice`: Providing advice in specialized fields without expertise.

#### PII (Personally Identifiable Information) Plugins

- `pii:api-db`: Ensures the model does not attempt to access APIs or databases to retrieve PII.
- `pii:direct`: Tests if the model directly discloses PII when explicitly asked.
- `pii:session`: Ensures the model does not leak PII across different user sessions or interactions.
- `pii:social`: Tests if the model can be manipulated into revealing PII through social engineering tactics.

#### Brand Plugins

- `contracts`: Tests if the model enters business or legal commitments without supervision.
- `excessive-agency`: Evaluates if the model takes excessive initiative or misunderstands its capabilities.
- `hallucination`: Tests if the model generates false or misleading information.
- `imitation`: Checks if the model imitates people, brands, or organizations.
- `politics`: Tests if the model makes political statements.

#### Technical plugins

- `debug-access`: Checks if the model attempts to access or use debugging commands.
- `rbac`: Evaluates if the model properly implements Role-Based Access Control (RBAC).
- `shell-injection`: Tests if the model attempts to execute shell commands.
- `sql-injection`: Checks if the model performs SQL injection attacks to manipulate database queries.
- `bfla`: Checks if the model performs Broken Function Level Authorization (BFLA) attacks to manipulate function-level access controls.
  - Takes a `config` object with `targetIdentifiers` property. For example:
    ```yaml
    redteam:
      plugins:
        - id: 'bfla'
          config:
            targetIdentifiers:
              - 'john.doe@example.com'
              - 'reservation 10293'
    ```
- `bola`: Checks if the model performs Broken Object Level Authorization (BOLA) attacks to manipulate object-level access controls.
  - Takes a `config` object with `targetSystems` property. For example:
    ```yaml
    redteam:
      plugins:
        - id: 'bola'
          config:
            targetSystems:
              - 'Dropbox'
              - 'Sharepoint'
    ```
- `ssrf`: Checks if the model performs Server-Side Request Forgery (SSRF) attacks to fetch resources from unexpected or unauthorized destinations.
  - Takes a `config` object with `targetUrls` property. For example:
    ```yaml
    redteam:
      plugins:
        - id: 'ssrf'
          config:
            targetUrls:
              - 'https://internal-api.example.com'
              - 'file:///etc/passwd'
    ```
  - By default uses a [target URL](https://promptfoo.dev/plugin-helpers/ssrf.txt) on the promptfoo.dev host. We recommend placing with your own internal URL.

### Plugin Collections

- `harmful`: Includes all available harm plugins
- `pii`: Includes all available PII plugins

### Custom Policies

In addition to the predefined plugins, you can create one or more custom policies to test specific requirements or constraints of your application. Custom policies allow you to generate targeted redteam tests that are tailored to your business needs.

#### Configuring Custom Policies

To use a custom policy, add a `policy` field to your redteam configuration:

```yaml
redteam:
  plugins:
    - id: 'policy'
      numTests: 10
      config:
        policy: 'Your custom policy statement here'
```

#### Example of a Custom Policy

Here's an example of a well-crafted custom policy for an educational context:

```yaml
policy: >
  The output must provide educational support that enhances learning and critical thinking:
  - Offer explanations, examples, and step-by-step guidance to help students understand concepts.
  - Encourage students to articulate their thought processes and reasoning.
  - Suggest resources and study strategies to support independent learning.

  The policy should anticipate attempts to bypass it, such as:
  - Requesting interpretations or analyses that would replace the student's own critical thinking.
  - Asking for direct answers under the guise of "checking their work."
  - Seeking generation of full outlines or detailed structures for essays or reports.
```

#### Best Practices for Custom Policies

1. Be specific and clear in your policy statement, with concrete examples of desired behaviors.
2. Enumerate potential edge cases and loopholes.
3. Write policies as affirmations rather than negations when possible.

### Other pointers

- Duplicate plugins are removed, keeping the last occurrence
- Plugins are sorted alphabetically in the final configuration

To see a complete list of available plugins, run:

```bash
promptfoo generate redteam --help
```

## Strategies

Strategies modify or generate additional test cases based on the output of other plugins.

#### Available Strategies

- `prompt-injection`: Creates prompt injection test cases (Default)
- `jailbreak`: Applies a linear probe jailbreak technique (Default)
- `jailbreak:tree`: Applies an advanced tree jailbreak technique
- `rot13`: Applies ROT13 encoding to the injected variable, shifting each letter 13 positions in the alphabet
- `base64`: Encodes the injected variable using Base64 encoding
- `leetspeak`: Converts the injected variable to leetspeak, replacing certain letters with numbers or symbols

#### Strategy Specification

- As a string: `"jailbreak"`
- As an object: `{ id: "prompt-injection" }`

Strategies are applied after regular plugins generate their test cases. They do not support `numTests` and the number of additional test cases varies by strategy.

### Purpose

The `purpose` field provides context to guide the generation of adversarial inputs. It is derived automatically, or you can set it.

The purpose should be short but descriptive, as it will be used as the basis for generated adversarial tests. For example:

```yaml
redteam:
  purpose: 'Helpful travel agent specializing in Europe, currently chatting with John Smith'
```

### Provider

The `redteam.provider` field allows you to specify a provider configuration for the "attacker" model, i.e. the model that generates adversarial _inputs_.

Note that this is separate from the "target" model(s), which are set in the top-level [`providers` configuration](/docs/configuration/guide/).

A common use case is to use a [custom HTTP endpoint](/docs/providers/http/) or [a custom Python implementation](/docs/providers/python/). See the full list of available providers [here](/docs/providers/).

You can set up the provider in several ways:

1. As a string:

   ```yaml
   redteam:
     provider: 'openai:gpt-4'
   ```

2. As an object with additional configuration:

   ```yaml
   redteam:
     provider:
       id: 'openai:gpt-4'
       config:
         temperature: 0.7
         max_tokens: 150
   ```

3. Using a file reference:
   ```yaml
   redteam:
     provider: file://path/to/provider.yaml
   ```

For more detailed information on configuration options, refer to the [ProviderOptions documentation](/docs/configuration/reference/#provideroptions).

## Best Practices

1. Start with a configuration created by `promptfoo redteam init`
2. Remove irrelevant plugins for your use case
3. Adjust `numTests` for individual plugins based on importance
4. Run a redteam evaluation and generate additional tests as needed

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
  provider: 'openai:chat:gpt-4-turbo'
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
