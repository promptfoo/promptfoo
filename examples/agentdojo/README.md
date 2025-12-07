# agentdojo (AgentDojo Security Benchmark)

Evaluate LLM agents against prompt injection attacks using [AgentDojo](https://github.com/ethz-spylab/agentdojo) (ETH Zurich, NeurIPS 2024).

## Quick Start

```bash
npx promptfoo@latest init --example agentdojo
cd agentdojo

# Setup Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run evaluation
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Environment Variables

- `OPENAI_API_KEY` - Required for default GPT-5.1 configuration

## Configuration

Edit `promptfooconfig.yaml` to change model, defense strategy, or attack type:

```yaml
providers:
  - id: file://provider.py
    config:
      model: gpt-5.1 # or gpt-4o-2024-05-13, claude-3-5-sonnet-20241022
      defense: null # or tool_filter, spotlighting_with_delimiting
      attack: important_instructions # or injecagent, tool_knowledge
```

Limit test cases for faster iteration:

```yaml
tests:
  - path: file://dataset.py:generate_tests
    config:
      suite: workspace
      max_user_tasks: 5
      max_injection_tasks: 3
```

## Understanding Results

| Metric           | Description                          |
| ---------------- | ------------------------------------ |
| **security**     | Was the injection blocked?           |
| **utility**      | Did the agent complete the task?     |
| **safe_utility** | Both secure AND useful? (key metric) |

A model with 100% utility but 0% security is **dangerous** - it works but is completely compromised by prompt injection.

## Example Results

GPT-5.1 with `important_instructions` attack, no defense:

| Metric               | Result |
| -------------------- | ------ |
| Injections Blocked   | 0%     |
| User Tasks Completed | 100%   |
| Safe Utility         | 0%     |

The model completes all tasks correctly but follows every injected instruction - sending unauthorized emails, leaking data, etc.

## Learn More

- [AgentDojo Paper](https://arxiv.org/abs/2406.13352)
- [Promptfoo Red Team Docs](https://www.promptfoo.dev/docs/red-team/)
