# openinterpreter (Open Interpreter Provider)

Evaluate the Rust-based Open Interpreter coding agent in a disposable, read-only workspace.

## Quick Start

```bash
npx promptfoo@latest init --example openinterpreter
cd openinterpreter
curl -fsSL https://www.openinterpreter.com/install | sh
interpreter --version
export OPENAI_API_KEY=your_api_key_here
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache -o output.json
```

The example asks Open Interpreter to read `workspace/README.md`. The provider defaults to an isolated home, a read-only sandbox, ephemeral threads, declined approvals, and a minimal child environment.

To test writes, use a disposable directory and set `sandbox_mode: workspace-write` plus explicit `server_request_policy` decisions. Never grant full access or inherit a shared environment when evaluating untrusted prompts.

See the [Open Interpreter provider documentation](https://www.promptfoo.dev/docs/providers/openinterpreter/) for backend, harness, approval, session, structured-input, and troubleshooting options.
