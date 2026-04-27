# toolathlon-poc (Toolathlon-Style Agentic Evaluation)

This example is a proof-of-concept promptfoo eval shaped like Toolathlon ([arXiv:2510.25726](https://arxiv.org/abs/2510.25726), [GitHub](https://github.com/hkust-nlp/Toolathlon)): an agent receives a fuzzy long-horizon task, uses local MCP tools against a real workspace, and is graded by inspecting post-state instead of model text.

## What the task evaluates

The `reconcile-orders` task rebuilds `workspace/` from checked-in seeds:

- `workspace/orders.db`: SQLite database with an `orders(id, customer_email, amount, status)` table.
- `workspace/customers.csv`: customer list intentionally missing three emails that appear in orders.
- `workspace/README.md`: workspace-local guidance with one red herring.

The agent must add missing customers, mark every pending order as `confirmed`, and write `workspace/summary.json` with `{"added_customers": int, "confirmed_orders": int}`. `grade.py` ignores the model's final text and verifies the filesystem and database state.

## MCP servers used

The eval uses the `anthropic:claude-agent-sdk` provider with two local stdio MCP servers:

- Filesystem: `npx -y @modelcontextprotocol/server-filesystem <workspace>`
- SQLite: `uvx mcp-server-sqlite --db-path <workspace>/orders.db`

We first checked `anthropic:messages` with `config.mcp.servers`, but the current provider exposes MCP tools to Claude without executing a multi-turn tool-result loop. This PoC therefore uses the Claude Agent SDK fallback so the task is genuinely agentic and produces tool-call spans.

Prerequisites: Node dependencies installed for this repo, `uvx` available on `PATH`, and Anthropic credentials available to Claude Agent SDK. In this environment the example runs through the existing Claude Code authentication; you can also set `ANTHROPIC_API_KEY` in the repo-root `.env` or your shell.

## How to run

From the repository root:

```bash
python examples/toolathlon-poc/setup_workspace.py
npm run local -- eval -c examples/toolathlon-poc/promptfooconfig.yaml --env-file examples/toolathlon-poc/.env --no-cache -o examples/toolathlon-poc/output.json
```

If your Anthropic API key is in the repo-root `.env`, include it too:

```bash
python examples/toolathlon-poc/setup_workspace.py
npm run local -- eval -c examples/toolathlon-poc/promptfooconfig.yaml --env-file .env --env-file examples/toolathlon-poc/.env --no-cache -o examples/toolathlon-poc/output.json
```

Run `python examples/toolathlon-poc/setup_workspace.py` before every eval. The PoC uses one shared local workspace per run and does not isolate parallel tests.

Expected result: the single `reconcile-orders` test passes with score `1.0`. The output JSON should include tool calls from filesystem and SQLite MCP tools in provider metadata, and tracing is enabled for inspection in the promptfoo UI.

## Inspecting the result

```bash
python - <<'PY'
import json
from pathlib import Path
result = json.loads(Path('examples/toolathlon-poc/output.json').read_text())
print('success:', result.get('success'))
for item in result.get('results', {}).get('results', []):
    response = item.get('response', {})
    print('score:', item.get('score'))
    print('assertion:', item.get('gradingResult', {}).get('reason'))
    print('tool calls:', len(response.get('metadata', {}).get('toolCalls', [])))
PY
```
