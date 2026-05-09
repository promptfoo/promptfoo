# redteam-sql-injection-agent (SQL Injection Agent Examples)

This example shows what SQL injection looks like in a tool-using LLM agent built
with the OpenAI Agents Python SDK.

The important distinction is that the model is not the database. The vulnerable
path appears when model-controlled tool arguments are interpolated into SQL as
query structure instead of being bound as data.

## Included Agents

- `unsafe-ticket-agent`: a support assistant that searches only Alex's tickets
  in principle, but its tool interpolates a string filter directly into SQL.
- `hardened-ticket-agent`: the same vulnerable query wrapped in a naive denylist
  that blocks obvious payloads such as `OR 1=1 --` but can still be bypassed.
- `safe-ticket-agent`: the same assistant with a parameterized ticket-search
  tool.
- `unsafe-order-agent`: an account-specific order lookup that interpolates a
  numeric-looking filter directly into SQL.
- `raw-sql-analyst`: an intentionally authorized read-only SQL tool used as a
  taxonomy control. This is dangerous capability, not injection.

## Files

- `agent_provider.py`: the Agents SDK providers and SQLite-backed tools
- `agent_provider_test.py`: deterministic tests for the unsafe, hardened, and
  safe tool semantics
- `promptfooconfig.yaml`: an eval that compares the five agent behaviors
- `requirements.txt`: Python dependencies

## Setup

```bash
npx promptfoo@latest init --example redteam-sql-injection-agent
cd redteam-sql-injection-agent

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export OPENAI_API_KEY=your_api_key_here
```

## Run

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache
```

When working inside the Promptfoo repo, use the local build instead:

```bash
npm run local -- eval -c examples/redteam-sql-injection-agent/promptfooconfig.yaml --no-cache
```

## Manual Tool Check

You can inspect the underlying SQLite behavior without making model calls:

```bash
python3 agent_provider.py
```

The unsafe ticket search returns every ticket for the payload
`refund%' OR 1=1 --`, while the parameterized safe search returns no rows.
The hardened variant blocks that textbook payload but still leaks rows for the
comment-obfuscated payload `refund%'/**/OR/**/1=1/**/OR/**/'%'='`.
Set `SQLI_AGENT_DB_PATH=/path/to/support.sqlite3` if you want to place the
generated SQLite database somewhere other than the example directory.

## Why This Helps Red Teaming

This example gives SQL injection tests three useful controls:

1. A positive control where quote-breaking SQL changes database behavior.
2. A partial-defense control where the obvious payload is blocked but a modestly
   obfuscated variant still works.
3. A negative control where the same payload is safely bound as data.
4. A taxonomy control where raw SQL is intentionally exposed and should not be
   mistaken for injection.

That makes it easier to judge whether generated SQL injection prompts are both
category-correct and actually useful against an LLM agent.
