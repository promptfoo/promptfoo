---
title: Node.js API reference
sidebar_label: Overview
description: Generated reference for promptfoo's supported Node.js API surface.
---

# Node.js API reference

The Node.js API reference is generated from a curated list of symbols exported
by the root `promptfoo` package entrypoint. That entrypoint is still the
supported public boundary for programmatic use, but the reference intentionally
focuses on APIs that are useful to call directly from application code.

## Install

```bash
npm install promptfoo
```

Promptfoo requires Node.js `^20.20.0 || >=22.22.0`. The Node.js API ships with
the same version of the `promptfoo` package used by the CLI.

```ts
import { evaluate } from 'promptfoo';
```

## Stability

| Stability | Meaning                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| Stable    | Supported for production use and documented as part of the public Node.js API |
| Internal  | Implementation detail; not part of the supported public API                   |

The most commonly used public surfaces are:

- [`evaluate()`](./reference/functions/evaluate)
- [`loadApiProvider()`](./reference/functions/loadApiProvider)
- [`assertions`](./reference/variables/assertions)
- [`cache`](./reference/promptfoo/namespaces/cache/)

## Start here

| Need                        | Start with                                                  |
| --------------------------- | ----------------------------------------------------------- |
| A first successful eval     | [Using the Node.js API](/docs/usage/node-package)           |
| A map of concepts and types | [Node.js API guide](/docs/usage/node-api-reference)         |
| Copyable patterns           | [Node.js API examples](/docs/usage/node-api-examples)       |
| Exact signatures            | [Reference overview](./reference/)                          |
| Custom provider contracts   | [`CallApiFunction`](./reference/interfaces/CallApiFunction) |

## Browse the generated reference

- [Reference overview](./reference/)
- [Core functions](./reference/functions/evaluate)
- [Provider interfaces](./reference/interfaces/ApiProvider)
- [Assertion helpers](./reference/variables/assertions)
- [Function callbacks](./reference/type-aliases/PromptFunction)
- [Transform helpers](./reference/type-aliases/TransformFunction)

For a task-oriented introduction, start with
[Using the Node.js API](/docs/usage/node-package).
