---
sidebar_position: 3
sidebar_label: Extension Hooks
title: Extension Hooks - Custom Evaluation Lifecycle Logic
description: Add custom setup, teardown, and per-test logic using extension hooks in promptfoo evaluations.
keywords:
  [extension hooks, beforeAll, afterAll, beforeEach, afterEach, evaluation lifecycle, custom hooks]
---

# Extension Hooks

Promptfoo supports extension hooks that allow you to run custom code at specific points in the evaluation lifecycle. These hooks are defined in extension files specified in the `extensions` property of your configuration.

## Available Hooks

| Name       | Description                                   | Context                                           |
| ---------- | --------------------------------------------- | ------------------------------------------------- |
| beforeAll  | Runs before the entire test suite begins      | `{ suite: TestSuite }`                            |
| afterAll   | Runs after the entire test suite has finished | `{ results: EvaluateResult[], suite: TestSuite }` |
| beforeEach | Runs before each individual test              | `{ test: TestCase }`                              |
| afterEach  | Runs after each individual test               | `{ test: TestCase, result: EvaluateResult }`      |

## Session Management

For multi-turn conversations or stateful interactions, hooks can manage per-test sessions.

### Pre-Test Session Definition

A common pattern is to create sessions in `beforeEach` and clean them up in `afterEach`:

```javascript
export async function extensionHook(hookName, context) {
  if (hookName === 'beforeEach') {
    const res = await fetch('http://localhost:8080/session');
    const sessionId = await res.text();
    return { test: { ...context.test, vars: { ...context.test.vars, sessionId } } };
  }

  if (hookName === 'afterEach') {
    const id = context.test.vars.sessionId;
    await fetch(`http://localhost:8080/session/${id}`, { method: 'DELETE' });
  }
}
```

See the [stateful-session-management example](https://github.com/promptfoo/promptfoo/tree/main/examples/config-stateful-session-management) for a complete implementation.

### Test-Time Session Definition

Session IDs returned by your provider in `response.sessionId` are automatically used for the test case, with `vars.sessionId` as fallback. Priority is: `response.sessionId` > `vars.sessionId`.

For HTTP providers, use `sessionParser` to extract session IDs from responses:

```yaml
providers:
  - id: http
    config:
      url: 'https://example.com/api'
      sessionParser: 'data.headers["x-session-id"]'
      headers:
        'x-session-id': '{{sessionId}}'
```

See the [HTTP provider session management documentation](/docs/providers/http#session-management) for complete details.

The session ID is available in `afterEach` at `context.result.metadata.sessionId`:

```javascript
async function extensionHook(hookName, context) {
  if (hookName === 'afterEach') {
    const sessionId = context.result.metadata.sessionId;
    if (sessionId) {
      console.log(`Test completed with session: ${sessionId}`);
    }
  }
}
```

For iterative red team strategies (e.g., jailbreak, tree search), `context.result.metadata.sessionIds` contains an array of all session IDs from the exploration process. Each iteration may have its own session ID, allowing you to track the full conversation history across multiple attempts.

## Implementing Hooks

Create a JavaScript or Python file with a function that handles the hooks you need, then specify it in the `extensions` array:

```yaml
extensions:
  - file://path/to/your/extension.js:extensionHook
  - file://path/to/your/extension.py:extension_hook
```

:::important
You must include the function name after the file path, separated by a colon (`:`).
:::

:::note
All extensions receive all event types (beforeAll, afterAll, beforeEach, afterEach). It's up to the extension function to decide which events to handle based on the `hookName` parameter.
:::

### Python Example

```python
from typing import Optional

def extension_hook(hook_name, context) -> Optional[dict]:
    # Perform any necessary setup
    if hook_name == 'beforeAll':
        print(f"Setting up test suite: {context['suite'].get('description', '')}")

        # Add an additional test case to the suite:
        context["suite"]["tests"].append(
            {
                "vars": {
                    "body": "It's a beautiful day",
                    "language": "Spanish",
                },
                "assert": [{"type": "contains", "value": "Es un día hermoso."}],
            }
        )

        # Add an additional default assertion to the suite:
        context["suite"]["defaultTest"]["assert"].append({"type": "is-json"})

        return context

    # Perform any necessary teardown or reporting
    elif hook_name == 'afterAll':
        print(f"Test suite completed: {context['suite'].get('description', '')}")
        print(f"Total tests: {len(context['results'])}")

    # Prepare for individual test
    elif hook_name == 'beforeEach':
        print(f"Running test: {context['test'].get('description', '')}")

        # Change all languages to pirate-dialect
        context["test"]["vars"]["language"] = f'Pirate {context["test"]["vars"]["language"]}'

        return context

    # Clean up after individual test or log results
    elif hook_name == 'afterEach':
        print(f"Test completed: {context['test'].get('description', '')}. Pass: {context['result'].get('success', False)}")


```

### JavaScript Example

```javascript
async function extensionHook(hookName, context) {
  // Perform any necessary setup
  if (hookName === 'beforeAll') {
    console.log(`Setting up test suite: ${context.suite.description || ''}`);

    // Add an additional test case to the suite:
    context.suite.tests.push({
      vars: {
        body: "It's a beautiful day",
        language: 'Spanish',
      },
      assert: [{ type: 'contains', value: 'Es un día hermoso.' }],
    });

    return context;
  }

  // Perform any necessary teardown or reporting
  else if (hookName === 'afterAll') {
    console.log(`Test suite completed: ${context.suite.description || ''}`);
    console.log(`Total tests: ${context.results.length}`);
  }

  // Prepare for individual test
  else if (hookName === 'beforeEach') {
    console.log(`Running test: ${context.test.description || ''}`);

    // Change all languages to pirate-dialect
    context.test.vars.language = `Pirate ${context.test.vars.language}`;

    return context;
  }

  // Clean up after individual test or log results
  else if (hookName === 'afterEach') {
    console.log(
      `Test completed: ${context.test.description || ''}. Pass: ${context.result.success || false}`,
    );
  }
}

module.exports = extensionHook;
```

The `beforeAll` and `beforeEach` hooks may mutate specific properties of their context arguments to modify evaluation state. To persist changes, the hook must return the modified context.

## Hook Context Reference

### beforeAll

| Property                          | Type                                                    | Description                                                                                |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `context.suite.prompts`           | [`Prompt[]`](/docs/configuration/types#prompt)          | The prompts to be evaluated.                                                               |
| `context.suite.providerPromptMap` | `Record<string, Prompt[]>`                              | A map of provider IDs to [prompts](/docs/configuration/types#prompt).                      |
| `context.suite.tests`             | [`TestCase[]`](/docs/configuration/reference#test-case) | The test cases to be evaluated.                                                            |
| `context.suite.scenarios`         | [`Scenario[]`](/docs/configuration/types#scenario)      | The [scenarios](/docs/configuration/scenarios) to be evaluated.                            |
| `context.suite.defaultTest`       | [`TestCase`](/docs/configuration/reference#test-case)   | The default test case to be evaluated.                                                     |
| `context.suite.nunjucksFilters`   | `Record<string, FilePath>`                              | A map of [Nunjucks](https://mozilla.github.io/nunjucks/) filters.                          |
| `context.suite.derivedMetrics`    | `Record<string, string>`                                | A map of [derived metrics](/docs/configuration/expected-outputs#creating-derived-metrics). |
| `context.suite.redteam`           | `Redteam[]`                                             | The [red team](/docs/red-team) configuration to be evaluated.                              |

### beforeEach

| Property       | Type                                                  | Description                    |
| -------------- | ----------------------------------------------------- | ------------------------------ |
| `context.test` | [`TestCase`](/docs/configuration/reference#test-case) | The test case to be evaluated. |
