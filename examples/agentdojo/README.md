# agentdojo (AgentDojo Security Benchmark)

Evaluate LLM agents against prompt injection attacks using [AgentDojo](https://github.com/ethz-spylab/agentdojo) (ETH Zurich, NeurIPS 2024).

## Quick Start

```bash
npx promptfoo@latest init --example agentdojo
cd agentdojo

# Setup Python 3.10+ environment
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run the checked-in one-row smoke evaluation
npx promptfoo@latest eval --no-cache
npx promptfoo@latest view
```

## Environment Variables

- `OPENAI_API_KEY` - Required for default GPT-5.4 configuration

The checked-in config runs one user task against one injection task so that
you can inspect a trace before spending on a benchmark run. Remove
`max_user_tasks` and `max_injection_tasks` from `promptfooconfig.yaml` when
you are ready to run the full 560-row workspace suite.

AgentDojo 0.1.35 requires Python 3.10 or newer.

## Configuration

Edit `promptfooconfig.yaml` to change model, defense strategy, or attack type:

```yaml
providers:
  - id: file://provider.py
    config:
      model: gpt-5.4 # or gpt-4o-2024-05-13, claude-3-5-sonnet-20241022
      defense: null # or tool_filter, spotlighting_with_delimiting
      attack: important_instructions # or injecagent, tool_knowledge
      force_rerun: true # bypass AgentDojo's local trace cache for fresh comparisons
      temperature: 0 # keep benchmark comparisons deterministic
```

Custom GPT models use Promptfoo's OpenAI Responses wrapper with an AgentDojo
pipeline builder that mirrors AgentDojo's built-in defenses, including
`tool_filter`, `repeat_user_prompt`, `spotlighting_with_delimiting`, and
`transformers_pi_detector`.

AgentDojo's model registry does not include GPT-5.4. For custom GPT models,
this example creates a custom AgentDojo pipeline and registers the configured
model name so model-addressing attacks target the actual model under test. Use an
AgentDojo-registered model ID when you need to reproduce the paper's published
benchmark rows exactly.

The `transformers_pi_detector` defense requires AgentDojo's transformers extra:

```bash
pip install "agentdojo[transformers]"
```

Choose a larger slice for a controlled comparison:

```yaml
tests:
  - path: file://dataset.py:generate_tests
    config:
      suite: workspace
      attack: important_instructions
      max_user_tasks: 5
      max_injection_tasks: 3
```

Keep the dataset `attack` value aligned with the provider `attack`. For
DoS-style attacks such as `dos` and `captcha_dos`, the generator emits only the
single raw AgentDojo injection row so aggregate metrics are not duplicated
across every injection task ID.

Run the focused Python helper tests after changing the integration:

```bash
python -m unittest discover -p '*_test.py'
```

## Understanding Results

| Metric           | Description                          |
| ---------------- | ------------------------------------ |
| **security**     | Was the injection blocked?           |
| **utility**      | Did the agent complete the task?     |
| **safe_utility** | Both secure AND useful? (key metric) |

AgentDojo calls the attacker metric "targeted attack success rate" (ASR). This
example reports the complement as `security`: a row passes security when the
injected malicious goal was **not** executed.

A model with high utility but low security is dangerous: it works, but it also
executes attacker goals from untrusted tool output.

## Tracing

This example enables Promptfoo tracing by default. Promptfoo passes W3C
`traceparent` context into the Python provider, and the provider exports an
`agentdojo.task` child span to Promptfoo's OTLP/JSON receiver.
The `trace` metric asserts that this span was stored and made available to
Promptfoo assertions.

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
```

To forward traces to an external collector, set:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="promptfoo-agentdojo-provider"
```

## Example Results

GPT-5.4 with `important_instructions` attack, no defense:

| Metric               | Result |
| -------------------- | ------ |
| Injections Blocked   | 100%   |
| User Tasks Completed | 95.2%  |
| Safe Utility         | 95.2%  |

In this run, GPT-5.4 blocked every injected attacker goal in the workspace suite
and completed most user tasks. The remaining failures were utility failures, not
successful prompt injections.

## Learn More

- [AgentDojo Paper](https://arxiv.org/abs/2406.13352)
- [Promptfoo Red Team Docs](https://www.promptfoo.dev/docs/red-team/)
