---
title: Node.js API reference
sidebar_label: Overview
description: Generated reference and stability guide for promptfoo's supported Node.js API surface.
---

# Node.js API reference

The Node.js API reference is generated from the root `promptfoo` package
entrypoint. That entrypoint is the supported public boundary for programmatic
use. If a symbol is not exported from `promptfoo`, treat it as internal unless
the docs say otherwise.

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

- [Functions](./reference/functions/evaluate)
- [Interfaces](./reference/interfaces/ApiProvider)
- [Type aliases](./reference/type-aliases/EvaluateTestSuite)
- [Variables](./reference/variables/assertions)
- [Full generated index](./reference/)

For a task-oriented introduction, start with
[Using the Node.js API](/docs/usage/node-package).
