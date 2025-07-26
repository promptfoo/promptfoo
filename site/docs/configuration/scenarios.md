---
sidebar_position: 13
sidebar_label: Scenarios
title: Scenario Configuration - Grouping Tests and Data
description: Configure scenarios to group test data with evaluation tests. Learn how to organize and run multiple test combinations efficiently in promptfoo.
keywords:
  [
    test scenarios,
    grouped testing,
    test organization,
    data combinations,
    evaluation scenarios,
    test management,
  ]
pagination_prev: configuration/test-cases
pagination_next: configuration/datasets
---

# Scenarios

The `scenarios` configuration lets you group a set of data along with a set of tests that should be run on that data.
This is useful for when you want to test a wide range of inputs with the same set of tests.

## Example

Let's take the example of a language translation app. We want to test whether the system can accurately translate three phrases ('Hello world', 'Good morning', and 'How are you?') from English to three different languages (Spanish, French, and German).

```text title="prompts.txt"
You're a translator.  Translate this into {{language}}: {{input}}
---
Speak in {{language}}: {{input}}
```

Instead of creating individual `tests` for each combination,
we can create a `scenarios` that groups this data and the tests/assertions together:

```yaml title="promptfooconfig.yaml"
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

The full source behind this sample is in [`examples/multiple-translations`][1].

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

### Using Glob Patterns

You can use glob patterns to load multiple scenario files at once:

```yaml
scenarios:
  - file://scenarios/*.yaml # All YAML files in scenarios directory
  - file://scenarios/unit-*.yaml # All files matching unit-*.yaml
  - file://scenarios/**/*.yaml # All YAML files in subdirectories
```

When using glob patterns, all matched files are loaded and their scenarios are automatically flattened into a single array. This is useful for organizing large test suites:

```
scenarios/
├── unit/
│   ├── auth-scenarios.yaml
│   └── api-scenarios.yaml
└── integration/
    ├── workflow-scenarios.yaml
    └── e2e-scenarios.yaml
```

You can mix glob patterns with direct file references:

```yaml
scenarios:
  - file://scenarios/critical.yaml # Specific file
  - file://scenarios/unit/*.yaml # All unit test scenarios
```

This functionality allows you to easily run a wide range of tests without having to manually create each one. It also keeps your configuration file cleaner and easier to read.

[1]: https://github.com/promptfoo/promptfoo/tree/main/examples/multiple-translations
