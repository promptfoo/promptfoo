# simulated-user-support (Tau-bench-style Simulated User Support)

This example is a small agentic-eval proof of concept inspired by τ-bench (Yao et al., [arXiv:2406.12045](https://arxiv.org/abs/2406.12045)). A simulated customer LLM chats with an agent under test, the agent calls in-process CRM/refund tools, and a Python grader combines deterministic tool-call checks with an LLM conversational rubric.

## What it evaluates

- Whether an agent gathers order, customer, warranty, and policy facts before resolving a refund request.
- Whether tool calls match the policy outcome for three retail-support scenarios.
- Whether the conversation remains professional while the simulated customer pushes toward a hidden goal.

## Prerequisites

From this directory or the repo root, install the example-level SDK you plan to use:

```bash
pip install anthropic
# Optional OpenAI mode:
pip install openai
```

Set credentials for the chosen provider:

```bash
export ANTHROPIC_API_KEY=...
# Optional OpenAI mode:
export SIMUSER_PROVIDER=openai
export OPENAI_API_KEY=...
```

By default the agent uses `claude-sonnet-4-5-20250929` and the simulated user/grader use `claude-haiku-4-5-20251001`. Override with `SIMUSER_AGENT_MODEL`, `SIMUSER_USER_MODEL`, and `SIMUSER_GRADER_MODEL`. For a no-network smoke test, use `SIMUSER_PROVIDER=stub`.

## Run

```bash
npm run local -- eval -c examples/simulated-user-support/promptfooconfig.yaml --no-cache -o examples/simulated-user-support/results.json --max-concurrency 1
```

Smoke test without API calls:

```bash
SIMUSER_PROVIDER=stub SIMUSER_SKIP_LLM_RUBRIC=1 npm run local -- eval -c examples/simulated-user-support/promptfooconfig.yaml --no-cache -o examples/simulated-user-support/results.stub.json --max-concurrency 1
```

For `npx promptfoo@latest init --example simulated-user-support`, copy this directory as a self-contained example and run the same command with `npx promptfoo@latest eval`.

## Scenarios and expected behavior

- Scenario A: $89 headphones purchased 12 days ago. The agent should issue an $89 cash refund.
- Scenario B: $89 headphones purchased 45 days ago but still under warranty. The agent should refuse cash, explain why, and offer store credit or replacement.
- Scenario C: $40 phone case purchased 400 days ago by a gold-tier customer. The agent should check warranty and customer tier, then issue up to $40 store credit without manager escalation.

Expected pass rate with current prompts: scenario A should pass about 95% of the time; scenarios B and C should pass about 70% of the time because they require firmer policy-following and better customer-tier reasoning.

## Files

- `provider.py` runs the multi-turn simulated-user loop and returns transcript metadata.
- `agent.py` wraps the agent LLM and tool-calling interface.
- `simulated_user.py` creates the cooperative customer LLM.
- `tools.py` and `seeds.py` define the in-memory CRM state and tools.
- `grader.py` checks required and forbidden tool calls, refund type/amount, and conversational quality.
