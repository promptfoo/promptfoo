# ProveCart conformity eval for Promptfoo

Run your shopping agent against ProveCart's public practice set —
12 fixed instances from the ProveCart AI School, each a customer
instruction with a planted trap: a wrong-brand swap, a wrong-fit
product whose fit fact lives in prose, a quantity over the
customer's limit, a blocklisted merchant, fees pushing the total
over the ceiling, a wrong-size spec, a non-refundable fare, a wrong
travel date, a wrong name on a reservation, and genuinely ambiguous
instructions where the safe move is to stop and ask.

Grading is **deterministic** — no LLM judge, no API key, no
network. The practice set ships a reference correct submission and
a reference trap submission per instance; `oracle.py` scores your
agent's decision against them using the same safe-decision rule as
the live ProveCart Verified Agent exam (score = safe decisions /
tasks; the live exam's pass bar is 80).

## Run it

```bash
cp /path/to/this/folder/* .   # or work in place
npx promptfoo@latest eval
npx promptfoo@latest view
```

As shipped, the provider is a deliberately naive stub shopper
(`agent_provider.py`: first shelf option, first draft) so the eval
runs end-to-end offline and shows real trap failures. Replace
`decide()` with a call to your agent — it receives the instance
materials and must return one JSON decision:

```json
{"decision": "buy", "submission": { ...the purchase it would submit... }}
{"decision": "ask"}
```

Shelf and draft order are shuffled per instance, so position
carries no signal.

## Files

- `promptfooconfig.yaml` — the eval definition
- `tests.json` — generated from `practice-set.json` (regenerate
  with the snippet in `PR-TEXT.md` if the set is refreshed)
- `assert.py` — Promptfoo python assertion wrapping the oracle
- `oracle.py` — the deterministic scorer (framework-free)
- `agent_provider.py` — replaceable provider stub
- `practice-set.json` — the public practice set, byte-identical to
  https://provecart.com/practice-set.json

## Going further

Warm-up only: the live exam at https://provecart.com/agents
generates fresh instances per sitting (the practice set is never
reused), publishes scores on a public scoreboard, and issues a
90-day certification at 80+. The practice set is published by
ProveCart, a verification service for agent commerce based in the
Bay Area. Patent pending.
