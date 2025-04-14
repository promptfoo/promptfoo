---
sidebar_position: 26
sidebar_label: Scenarios
---

# Scenarios

The `scenarios` configuration lets you group a set of data along with a set of tests that should be run on that data.
This is useful for when you want to test a wide range of inputs with the same set of tests.

## Example

Let's take the example of a language translation app. We want to test whether the system can accurately translate three phrases ('Hello world', 'Good morning', and 'How are you?') from English to three different languages (Spanish, French, and German).

```text title=prompts.txt
You're a translator.  Translate this into {{language}}: {{input}}
---
Speak in {{language}}: {{input}}
```

Instead of creating individual `tests` for each combination,
we can create a `scenarios` that groups this data and the tests/assertions together:

```yaml title=promptfooconfig.yaml
scenarios:
  - config:
      - vars:
          language: Spanish
          expectedHelloWorld: 'Hola mundo'
          expectedGoodMorning: 'Buenos días'
          expectedHowAreYou: '¿Cómo estás?'
      - vars:
          language: French
          expectedHelloWorld: 'Bonjour le monde'
          expectedGoodMorning: 'Bonjour'
          expectedHowAreYou: 'Comment ça va?'
      - vars:
          language: German
          expectedHelloWorld: 'Hallo Welt'
          expectedGoodMorning: 'Guten Morgen'
          expectedHowAreYou: 'Wie geht es dir?'
    tests:
      - description: Translated Hello World
        vars:
          input: 'Hello world'
        assert:
          - type: similar
            value: '{{expectedHelloWorld}}'
            threshold: 0.90
      - description: Translated Good Morning
        vars:
          input: 'Good morning'
        assert:
          - type: similar
            value: '{{expectedGoodMorning}}'
            threshold: 0.90
      - description: Translated How are you?
        vars:
          input: 'How are you?'
        assert:
          - type: similar
            value: '{{expectedHowAreYou}}'
            threshold: 0.90
```

This will generate a matrix of tests for each language and input phrase combination, running the same set of assertions on each.

The full source behind this sample is in [`examples/multiple-translations-scenarios`][1].

## Configuration

The `scenarios` configuration is an array of `Scenario` objects. Each `Scenario` has two main parts:

- `config`: an array of `vars` objects. Each `vars` object represents a set of variables that will be passed to the tests.
- `tests`: an array of `TestCase` objects. These are the tests that will be run for each set of variables in the `config`.

Here is the structure of a `Scenario`:

| Property    | Type                  | Required | Description                                                        |
| ----------- | --------------------- | -------- | ------------------------------------------------------------------ |
| description | `string`              | No       | Optional description of what you're testing                        |
| config      | `Partial<TestCase>[]` | Yes      | An array of variable sets. Each set will be run through the tests. |
| tests       | `TestCase[]`          | Yes      | The tests to be run on each set of variables.                      |

Scenarios can also be loaded from external files. To reference an external file, use the `file://` prefix:

```yaml
scenarios:
  - file://path/to/your/scenario.yaml
```

The external file should follow the same structure as inline scenarios.

This functionality allows you to easily run a wide range of tests without having to manually create each one. It also keeps your configuration file cleaner and easier to read.

[1]: https://github.com/promptfoo/promptfoo/tree/main/examples/multiple-translations-scenarios
