# toolathlon-poc (Toolathlon-Style Agentic Evaluation)

This example is a proof-of-concept promptfoo eval shaped like Toolathlon ([arXiv:2510.25726](https://arxiv.org/abs/2510.25726), [GitHub](https://github.com/hkust-nlp/Toolathlon)): an agent receives a fuzzy long-horizon task, uses local MCP tools against a real workspace, and is graded by inspecting post-state instead of model text.

## What the task evaluates

The `reconcile-orders` task rebuilds `workspace/` from checked-in seeds:

- `workspace/orders.db`: SQLite database with an `orders(id, customer_email, amount, status)` table.
- `workspace/customers.csv`: customer list intentionally missing three emails that appear in orders.
- `workspace/README.md`: workspace-local guidance with one red herring.

The agent must add missing customers, mark every pending order as `confirmed`, and write `workspace/summary.json` with `{"added_customers": int, "confirmed_orders": int}`. `grade.py` ignores the model's final text and verifies the filesystem and database state.

## Provider and MCP servers

The eval uses a custom Python provider (`agent_provider.py`) built on the OpenAI Agents Python SDK. It runs Azure-hosted gpt-5.5 through `AsyncAzureOpenAI`, attaches two local stdio MCP servers, and forwards Agents SDK spans into promptfoo's OTLP receiver through the copied `promptfoo_tracing.py` bridge.

Discovered Azure settings for this resource:

- Deployment name: `gpt-5.5`
- API version: `2025-04-01-preview`
- Resolved model in Azure response: `gpt-5.5-2026-04-24`

MCP servers:

- Filesystem: `npx -y @modelcontextprotocol/server-filesystem <workspace>`
- SQLite: `uvx mcp-server-sqlite --db-path <workspace>/orders.db`

## Prerequisites

- Node dependencies installed for this repo.
- `uvx` available on `PATH`.
- Azure credentials available as `AZURE_API_KEY` and `AZURE_API_BASE`.
- Python dependencies installed from this example's `requirements.txt`.

The repo-root `.env` can provide Azure credentials. Keep it out of git.

## How to run

From the repository root:

```bash
source ~/.nvm/nvm.sh && nvm use
python -m venv examples/toolathlon-poc/.venv
examples/toolathlon-poc/.venv/bin/pip install -r examples/toolathlon-poc/requirements.txt
set -a; source ../promptfoo/.env; set +a
python examples/toolathlon-poc/setup_workspace.py
PROMPTFOO_PYTHON=$PWD/examples/toolathlon-poc/.venv/bin/python \
PROMPTFOO_TOOLATHLON_WORKSPACE=$PWD/examples/toolathlon-poc/workspace \
PROMPTFOO_TOOLATHLON_DB=$PWD/examples/toolathlon-poc/workspace/orders.db \
  npm run local -- eval -c examples/toolathlon-poc/promptfooconfig.yaml --no-cache \
  -o examples/toolathlon-poc/toolathlon-azure-output.json
```

Run `python examples/toolathlon-poc/setup_workspace.py` before every eval. The PoC uses one shared local workspace per run and does not isolate parallel tests.

Expected result: the single `reconcile-orders` test passes with score `1.0`. The output JSON includes `traces` with model-generation spans and MCP tool-call spans.

## Inspecting the result

```bash
python - <<'PY'
import json
from pathlib import Path
result = json.loads(Path('examples/toolathlon-poc/toolathlon-azure-output.json').read_text())
row = result['results']['results'][0]
metadata = row['response']['metadata']
spans = [span for trace in result.get('traces', []) for span in trace.get('spans', [])]
print('eval:', result['evalId'])
print('score:', row['score'], 'pass:', row['success'])
print('turns:', metadata['turns'], 'tool calls:', len(metadata['tool_calls']))
print('spans:', len(spans))
print('llm spans:', sum(1 for span in spans if span['attributes'].get('openai.agents.span_type') == 'generation'))
print('mcp tool spans:', sum(1 for span in spans if span['name'].startswith('mcp.tool.call')))
PY
```

Last verified run:

- Eval ID: `eval-xu2-2026-04-27T20:16:37`
- Result: pass, score `1.0`
- Agent turns: `9`
- Provider metadata tool calls: `12`
- Total spans: `50`
- Span breakdown: `9` LLM generation, `12` MCP tool calls, `18` MCP tool-list spans, `11` other agent/turn/task spans
- Distinct span types: `generation`, `function`, `mcp_tools`, `custom`, `agent`
- Trace API check: `GET /api/traces/evaluation/eval-xu2-2026-04-27T20:16:37` returned `1` trace with `50` spans

Trace excerpt from `toolathlon-azure-output.json`:

```json
[
  {
    "name": "generation gpt-5.5",
    "span_type": "generation",
    "gen_ai.system": "azure.openai",
    "model": "gpt-5.5"
  },
  {
    "name": "mcp.tool.call list_allowed_directories",
    "span_type": "function",
    "tool.name": "list_allowed_directories",
    "mcp.server.name": "filesystem",
    "arguments": "{}",
    "result": "Allowed directories: .../examples/toolathlon-poc/workspace"
  },
  {
    "name": "mcp.tool.call list_directory",
    "span_type": "function",
    "tool.name": "list_directory",
    "mcp.server.name": "filesystem",
    "arguments": "{\"path\": \".../workspace\"}",
    "result": "[FILE] README.md; [FILE] customers.csv; [FILE] orders.db"
  }
]
```
