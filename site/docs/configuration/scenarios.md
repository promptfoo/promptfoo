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
You're a translator. Translate this into {{language}}: {{input}}
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

The full source behind this sample is in [`examples/config-multiple-translations`][1].

## Configuration

The `scenarios` configuration is an array of `Scenario` objects. Each `Scenario` has two main parts:

- `config`: an array of partial test cases or `$values` matrix-file references. Each expanded row is passed to the tests.
- `tests`: inline `TestCase` objects, an external test file, or a test generator. These tests run for each row in `config`.

Here is the structure of a `Scenario`:

| Property    | Type                                                                                | Required | Description                                                         |
| ----------- | ----------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| description | `string`                                                                            | No       | Optional description of what you're testing                         |
| config      | `Array<Partial<TestCase> \| { $values: string }>`                                   | Yes      | Inline rows or matrix-file references expanded before the tests run |
| tests       | `string \| TestGeneratorConfig \| Array<string \| TestGeneratorConfig \| TestCase>` | Yes      | Inline, generated, or file-backed tests for each expanded row       |

Scenarios can also be loaded from external files. To reference an external file, use the `file://` prefix:

```yaml
scenarios:
  - file://path/to/your/scenario.yaml
```

The external file should follow the same structure as inline scenarios.

Scenario tests use the standard test loader, so CSV, YAML, JSON, and generator files work the same way as top-level tests. File and generator paths in an external scenario resolve relative to that scenario file:

```yaml title="scenario.yaml"
config:
  - vars:
      language: French
tests: file://tests.csv
```

```yaml title="generated-scenario.yaml"
config:
  - vars:
      language: French
tests:
  - path: file://generate-tests.js
    config:
      count: 10
```

You can also keep large `config` matrices in separate files with `$values`:

```yaml
scenarios:
  - config:
      - $values: file://test-matrix.yaml
      - vars:
          language: German
    tests:
      - vars:
          input: 'Hello world'
```

```yaml title="test-matrix.yaml"
- vars:
    language: French
- vars:
    language: Spanish
```

The referenced YAML or JSON file should contain one `Partial<TestCase>` object or an array of them; loaded entries are flattened into the `config` array alongside any inline entries. Glob patterns such as `$values: file://matrices/*.yaml` load all matching files. Every non-empty row must contain a test case field such as `vars` or `assert` — flat key-value rows (such as raw CSV columns) are rejected with a pointer to nest them under `vars`.

A `$values` entry must have `$values` as its only key, and the referenced rows cannot themselves contain `$values`. Relative paths resolve against the file that declares them: the config file for inline scenarios, or the scenario file when the scenario itself is loaded via `file://`. When loading scenarios with a glob, keep matrix files out of the glob's reach (a different directory or extension) so they are not also loaded as scenarios.

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

[1]: https://github.com/promptfoo/promptfoo/tree/main/examples/config-multiple-translations
