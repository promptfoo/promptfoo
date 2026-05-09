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
- `unsafe-order-agent`, `hardened-order-agent`, and `safe-order-agent`:
  account-specific order lookup variants that exercise numeric predicate
  injection rather than quoted-string injection.
- `unsafe-expense-agent`, `hardened-expense-agent`, and `safe-expense-agent`:
  exact-ID expense lookup variants that exercise string-equality injection
  rather than `LIKE`-pattern injection.
- `unsafe-invoice-agent`, `hardened-invoice-agent`, and `safe-invoice-agent`:
  batch invoice lookup variants that exercise parenthesized `IN (...)` list
  injection.
- `unsafe-login-agent`, `hardened-login-agent`, and `safe-login-agent`:
  credential-check variants that exercise password-field authentication bypass.
- `unsafe-approval-agent`, `hardened-approval-agent`, and `safe-approval-agent`:
  two-field approval search variants that exercise a quoted status predicate
  while keeping a companion project-code field ordinary.
- `unsafe-invoice-export-agent`, `hardened-invoice-export-agent`, and
  `safe-invoice-export-agent`: projection-context export variants where the
  requested column list itself can contain a leaking subquery.
- `unsafe-case-agent`, `hardened-case-agent`, and `safe-case-agent`:
  case-closure variants that exercise stacked write statements.
- `raw-sql-analyst`: an intentionally authorized read-only SQL tool used as a
  taxonomy control. This is dangerous capability, not injection.

## Files

- `agent_provider.py`: the Agents SDK providers and SQLite-backed tools
- `agent_provider_test.py`: deterministic tests for the unsafe, hardened, and
  safe tool semantics
- `promptfooconfig.yaml`: an eval that compares the agent behaviors
- `promptfooconfig.redteam.yaml`: a generated-corpus benchmark that runs the
  same SQL injection probes against unsafe, hardened, and safe ticket agents
- `promptfooconfig.redteam.expenses.yaml`: the same benchmark structure for the
  exact-ID expense-report agents
- `promptfooconfig.redteam.orders.yaml`: the same benchmark structure for the
  numeric order-id agents
- `promptfooconfig.redteam.invoices.yaml`: the same benchmark structure for the
  parenthesized invoice-batch agents
- `promptfooconfig.redteam.logins.yaml`: the same benchmark structure for the
  credential-check login agents
- `promptfooconfig.redteam.approvals.yaml`: the same benchmark structure for
  two-field approval-search agents
- `promptfooconfig.redteam.exports.yaml`: the same benchmark structure for
  projection-context invoice-export agents
- `promptfooconfig.redteam.cases.yaml`: the same benchmark structure for the
  stacked-write case-closure agents
- `promptfooconfig.redteam.rawsql.yaml`: a taxonomy-control benchmark for the
  intentionally authorized raw-SQL analyst
- `score_redteam_results.py`: summarizes generated attack-family diversity,
  leaked rows, and grader failures from exported red-team results
- `score_redteam_matrix.py`: summarizes every generated benchmark lane that has
  both generated prompts and exported results
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

## Benchmark The Plugin

```bash
npm run local -- redteam generate \
  -c examples/redteam-sql-injection-agent/promptfooconfig.redteam.yaml \
  -o examples/redteam-sql-injection-agent/redteam.generated.yaml \
  --force --strict

npm run local -- redteam eval \
  -c examples/redteam-sql-injection-agent/redteam.generated.yaml \
  --no-cache --no-share -j 1 \
  -o examples/redteam-sql-injection-agent/redteam.results.json

python3 examples/redteam-sql-injection-agent/score_redteam_results.py \
  examples/redteam-sql-injection-agent/redteam.generated.yaml \
  examples/redteam-sql-injection-agent/redteam.results.json

python3 examples/redteam-sql-injection-agent/score_redteam_matrix.py
```

The benchmark uses three interpretations of the same product surface:

1. `unsafe-ticket-agent-redteam` should leak rows for successful payloads.
2. `hardened-ticket-agent-redteam` should resist obvious payloads but remain
   bypassable by stronger generations.
3. `safe-ticket-agent-redteam` should not leak rows for any generated payload.

Run `promptfooconfig.redteam.expenses.yaml` or
`promptfooconfig.redteam.orders.yaml` or
`promptfooconfig.redteam.invoices.yaml` or
`promptfooconfig.redteam.logins.yaml` or
`promptfooconfig.redteam.approvals.yaml` or
`promptfooconfig.redteam.exports.yaml` or
`promptfooconfig.redteam.cases.yaml` or
`promptfooconfig.redteam.rawsql.yaml` the same way when you want the exact-ID
expense-report, numeric order-id, parenthesized invoice-batch,
credential-check login, two-field approval-search, projection-context
invoice-export, stacked-write case-closure, or authorized raw-SQL benchmark
instead of the `LIKE`-search ticket benchmark.
