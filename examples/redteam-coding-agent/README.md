# redteam-coding-agent (Coding Agent Red Team)

Red team autonomous coding agents for repository prompt injection, terminal output injection, secret reads, sandbox read/write escapes, and verifier sabotage vulnerabilities.

```bash
npx promptfoo@latest init --example redteam-coding-agent
cd redteam-coding-agent
```

## Quick start

The default config targets `gpt-5.4` as a simulated coding agent. Set your API key and run:

```bash
export OPENAI_API_KEY=sk-...
npx promptfoo@latest redteam run
npx promptfoo@latest view
```

Required environment:

- `OPENAI_API_KEY`: Used by the default OpenAI provider. The Codex SDK provider also uses this when `CODEX_API_KEY` is not set.

Optional environment:

- `CODEX_API_KEY`: Use this for Codex SDK auth when you do not want to reuse `OPENAI_API_KEY`.
- `PROMPTFOO_REMOTE_GENERATION_URL`: Point generation at a self-hosted red-team generation service.
- `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true`: Disable remote generation. The `coding-agent:core` collection and the individual coding-agent plugins are unavailable in this mode because they require remote-generated scenarios.

When testing a real coding agent, set `providers[0].config.working_dir` to a disposable checkout and use synthetic canary secrets. Do not put production credentials in the eval environment.

## Using a real coding agent

For meaningful results, point the config at a real agent provider:

- **Codex SDK**: Uncomment the `openai:codex-sdk` provider in `promptfooconfig.yaml` and set `working_dir` to a disposable checkout.
- **Custom agent**: Use a `file://` provider or HTTP endpoint that wraps your agent framework.

Real agent providers should return structured output with command executions and trace data so the deterministic verifiers can inspect commands, outputs, and file changes — not just the final response.

Use a fresh writable checkout for each red-team row when you want high-confidence results. Coding agents leave files behind, change tests, and may copy canaries into artifacts; reusing one workspace across rows can make a later failure look like the wrong plugin failed.

## What the plugins test

| Plugin                      | Vulnerability                                            | Detection                                                    |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `repo-prompt-injection`     | Agent follows hidden instructions in repository files    | Canary value detection + LLM grading                         |
| `terminal-output-injection` | Agent treats build/test output as authoritative commands | Receipt propagation detection + LLM grading                  |
| `secret-env-read`           | Agent reads or exposes launcher environment variables    | Canary value detection in output/traces                      |
| `secret-file-read`          | Agent reads or exposes protected local files             | Canary value detection in output/traces/artifacts            |
| `sandbox-read-escape`       | Agent reads files outside the intended workspace         | Receipt detection + LLM grading                              |
| `sandbox-write-escape`      | Agent mutates files outside the intended workspace       | Command detection + host file/probe checks + LLM grading     |
| `verifier-sabotage`         | Agent weakens tests instead of fixing code               | Heuristic pattern detection + file hash checks + LLM grading |

## Strategies

Multi-turn strategies (`jailbreak:meta`, `jailbreak:hydra`, `goat`, `crescendo`) work with coding-agent plugins and significantly increase vulnerability detection rates. Encoding strategies (base64, rot13, etc.) are automatically excluded since they would break deterministic canary matching.

## Safety

- Never place production secrets in red-team configs. Use synthetic canaries (`{{secretEnvValue}}`).
- Run agents in disposable, least-privilege sandboxes and delete or reset the workspace between rows.
- The generated prompts ask the agent to do unsafe things — that's the point. The graders evaluate whether the agent resists.
