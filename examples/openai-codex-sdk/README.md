# openai-codex-sdk (OpenAI Codex SDK Examples)

The OpenAI Codex SDK provider enables agentic code analysis and generation evals with thread-based conversations and Git-aware operations.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-codex-sdk
cd openai-codex-sdk
```

## Setup

Install the OpenAI Codex SDK:

```bash
npm install @openai/codex-sdk
```

**Requirements**: Node.js 20.20+ or 22.22+

Authenticate with Codex using one of these options:

1. Sign in with ChatGPT through the Codex CLI:

```bash
codex
```

2. Or set your OpenAI API key:

```bash
export OPENAI_API_KEY=your_api_key_here
# or
export CODEX_API_KEY=your_api_key_here
```

When no `apiKey`, `OPENAI_API_KEY`, or `CODEX_API_KEY` is set, promptfoo will let the Codex SDK reuse an existing Codex login.

## Examples

### Basic Usage

Simple code generation with `sandbox_mode: read-only` so Codex can answer from the prompt without writing files. The example also sets `skip_git_repo_check: true` so it works in a standalone example directory that is not a Git repo.

This basic example uses only deterministic string assertions, so it can run with either a Codex login or an API key without needing a separate grader model credential.

**Location**: `./basic/`

**Usage**:

```bash
(cd basic && promptfoo eval)
```

### Skills Testing

This example demonstrates evaluating a local Codex skill stored under `.agents/skills/`.

- **Local skill discovery**: Codex discovers `SKILL.md` from the sample project's `.agents/skills/` directory
- **Skill assertions**: Verifies confirmed skill usage with the `skill-used` assertion over normalized `metadata.skillCalls`
- **Trace assertions**: `promptfooconfig.tracing.yaml` enables OTEL deep tracing and asserts on the traced command that reads `SKILL.md`
- **Isolated Codex home**: Uses a project-local `CODEX_HOME` so personal skills and config do not leak into the eval
- **Controlled shell environment**: Promptfoo now passes a minimal shell environment by default, so the tracing config can override `CODEX_HOME` without inheriting unrelated process secrets while still preserving a usable `PATH`

`metadata.skillCalls` only includes confirmed successful skill reads. When Promptfoo sees more candidate `SKILL.md` paths than confirmed successful reads, it also emits `metadata.attemptedSkillCalls` for debugging.

`metadata.skillCalls` and `metadata.attemptedSkillCalls` are heuristic: Promptfoo infers them from direct command references to `SKILL.md`. Wildcard paths are ignored, and absolute `.agents/...` paths outside the active repo are ignored.

**Location**: `./skills/`

**Usage**:

```bash
(cd skills && promptfoo eval)

# Trace the skill's internal command activity
(cd skills && promptfoo eval -c promptfooconfig.tracing.yaml)
```

If you run the config from a different working directory, set `CODEX_SKILLS_WORKING_DIR` and `CODEX_HOME_OVERRIDE` to absolute paths before invoking `promptfoo eval`.
The default relative paths in these configs are intentionally subdirectory-relative for the `(cd skills && promptfoo eval)` workflow above.

The checked-in `sample-codex-home` fixture is intentionally empty of auth state. Use it with `OPENAI_API_KEY`/`CODEX_API_KEY`, or point `CODEX_HOME_OVERRIDE` at `$HOME/.codex` when you want to reuse a local Codex login.

### Thread Persistence

This example demonstrates `persist_threads: true` with one prompt template and multiple tests. It checks that Codex can remember a marker from the first test when answering the second test.

**Location**: `./thread-persistence/`

**Usage**:

```bash
(cd thread-persistence && promptfoo eval)
```

### Sandbox Enforcement

This example runs Codex in `read-only` mode and asks it to create a file. The assertion checks that the model reports a write denial, and you can also inspect the sample workspace after the eval to confirm no file was created.

**Location**: `./sandbox/`

**Usage**:

```bash
(cd sandbox && promptfoo eval)
```

If you run this config from the repo root, set `CODEX_SANDBOX_WORKING_DIR="$PWD/examples/openai-codex-sdk/sandbox/sample-workspace"`.

## Key Features

- **Thread Persistence**: Conversations saved to `~/.codex/sessions`
- **Git Integration**: Automatic repository detection (can be disabled)
- **Structured Output**: Native JSON schema support with Zod
- **Streaming Events**: Real-time progress updates
- **Custom Binary**: Override Codex binary path with `codex_path_override`

## Configuration Options

See [documentation](https://www.promptfoo.dev/docs/providers/openai-codex-sdk/) for full details.
