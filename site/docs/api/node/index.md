---
title: Node.js API reference
sidebar_label: Overview
description: Generated reference and stability guide for promptfoo's supported Node.js API surface.
---

# Node.js API reference

The Node.js API reference is generated from a curated list of symbols exported
by the root `promptfoo` package entrypoint. That entrypoint is still the
supported public boundary for programmatic use, but the reference intentionally
focuses on APIs that are useful to call directly from application code.

## Stability

| Stability | Meaning                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| Stable    | Supported for production use and documented as part of the public Node.js API |
| Beta      | Available for advanced use, but the shape may evolve between releases         |
| Internal  | Implementation detail; not part of the supported public API                   |

The most commonly used public surfaces are:

- [`evaluate()`](./reference/functions/evaluate)
- [`loadApiProvider()`](./reference/functions/loadApiProvider)
- [`assertions`](./reference/variables/assertions)
- [`cache`](./reference/promptfoo/namespaces/cache/)
- [`guardrails`](./reference/variables/guardrails)
- [`redteam`](./reference/variables/redteam)

## Browse the generated reference

- [Reference overview](./reference/)
- [Core functions](./reference/functions/evaluate)
- [Provider interfaces](./reference/interfaces/ApiProvider)
- [Assertion helpers](./reference/variables/assertions)
- [Function callbacks](./reference/interfaces/PromptFunction)
- [Transform helpers](./reference/type-aliases/TransformFunction)

For a task-oriented introduction, start with
[Using the Node.js API](/docs/usage/node-package).
