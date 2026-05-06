# openai-agents-advanced (Sessions, Tracing, and Sandbox Agents)

This example exercises the OpenAI Agents SDK TypeScript features that matter once you move beyond a single-turn agent:

- persistent `MemorySession` history
- Promptfoo vars forwarded as SDK local run context
- file-exported SDK tools
- Promptfoo trajectory assertions over SDK traces
- `SandboxAgent` execution with the SDK local sandbox client
- sandbox skills loaded through SDK capability objects

## Prerequisites

- `OPENAI_API_KEY`

## Installation

```bash
npx promptfoo@latest init --example openai-agents-advanced
cd openai-agents-advanced
```

Or, from a cloned repository:

```bash
cd examples/openai-agents-advanced
npm install
```

## Run the session and tracing eval

```bash
npx promptfoo eval -c promptfooconfig.yaml --no-cache -j 1
```

The second test depends on the first test's remembered code word, so run this config with `-j 1`.

For stateful red-team strategies, use a session factory keyed by a per-test `sessionId` rather than one shared inline session. The [OpenAI Agents provider docs](https://www.promptfoo.dev/docs/providers/openai-agents/#stateful-red-team-runs) show the `transformVars` plus session-factory pattern that keeps turns together without sharing history across unrelated tests; the [multi-turn strategy docs](https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/) explain when `stateful: true` is appropriate.

## Run the sandbox and skill eval

```bash
npx promptfoo eval -c promptfooconfig.sandbox.yaml --no-cache
```

The sandbox eval mounts a synthetic `task.md`, asks the agent to use the `ticket-summary` skill, and asserts on traced shell activity plus the final answer.

See also the [Tracing docs](https://www.promptfoo.dev/docs/tracing/) for trajectory assertions and the [OpenAI Agents provider docs](https://www.promptfoo.dev/docs/providers/openai-agents/) for the full JavaScript SDK configuration surface.
