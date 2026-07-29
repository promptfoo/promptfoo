# agent-action-boundary (Agent Action Boundary)

This example shows how to use promptfoo to evaluate whether an agent action stays inside an approved runtime boundary.

It is intentionally model-free. The `echo` provider returns each action fixture, and the JavaScript assertion classifies the action using boundary fields such as operation, effect, destination, authority, approval state, and receipt freshness.

The goal is to test the control object around an agent action, not the language model response. This is useful for agent systems where a tool call, workflow step, browser action, MCP call, or shell command may create a real side effect.

## Usage

```bash
npx promptfoo@latest init --example agent-action-boundary
cd agent-action-boundary
promptfoo eval
```

You can also run it directly from the repository:

```bash
cd examples/agent-action-boundary
promptfoo eval
```

## What this checks

The fixture includes four representative cases:

- a safe read-only inventory lookup that should be allowed;
- a customer export that crosses a public destination and should be blocked;
- a refund action that needs dual approval because it creates a financial side effect;
- a stale external verifier receipt that should require review.

The assertion returns named scores for:

- boundary decision match;
- safe baseline handling;
- risky action protection;
- approval/receipt freshness.

This pattern can be adapted to real agent traces by replacing the YAML fixtures with exported tool-call records from an agent runtime.
