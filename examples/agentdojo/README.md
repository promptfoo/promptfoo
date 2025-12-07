# AgentDojo Security Benchmark

Evaluate LLM agents against prompt injection attacks using [AgentDojo](https://github.com/ethz-spylab/agentdojo), an evaluation framework from ETH Zurich (NeurIPS 2024).

## Quick Start

```bash
npx promptfoo@latest init --example agentdojo
```

## Overview

AgentDojo tests whether AI agents can be hijacked through prompt injection attacks. It provides:

- **4 Environment Suites**: Workspace, Travel, Slack, Banking
- **97 Realistic Tasks** with 629 security test cases
- **5 Attack Types**: important_instructions, tool_knowledge, injecagent, ignore_previous, direct
- **5 Defense Strategies**: None, transformers_pi_detector, tool_filter, spotlighting_with_delimiting, repeat_user_prompt

## Prerequisites

- Python 3.10+
- OpenAI API key (or other supported model provider)

## Setup

1. **Create a virtual environment** (required on macOS with protected system Python):

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

3. **Set your API key:**

   ```bash
   export OPENAI_API_KEY=your-api-key-here
   ```

4. **Generate test dataset:**

   ```bash
   # Quick test (limited tasks for faster iteration)
   python dataset.py --suite workspace --max-user-tasks 3 --max-injection-tasks 2

   # Single suite (all tasks)
   python dataset.py --suite workspace

   # Full benchmark (all suites - takes a long time)
   python dataset.py --all-suites
   ```

5. **List available suites:**

   ```bash
   python dataset.py --list-suites
   ```

## Running the Evaluation

```bash
# Ensure you're in the venv and set the Python path for Promptfoo
source .venv/bin/activate
export PROMPTFOO_PYTHON="$(pwd)/.venv/bin/python"

# Run evaluation
npx promptfoo@latest eval

# View results in browser
npx promptfoo@latest view
```

## Configuration

Edit `promptfooconfig.yaml` to customize the evaluation:

### Model

AgentDojo requires specific model version strings:

```yaml
config:
  model: gpt-4o-2024-05-13          # GPT-4o
  # model: gpt-4o-mini-2024-07-18   # GPT-4o-mini
  # model: claude-3-5-sonnet-20241022  # Claude 3.5 Sonnet
  # model: gemini-2.0-flash-001    # Gemini 2.0 Flash
```

Run `python -c "from agentdojo.agent_pipeline.agent_pipeline import ModelsEnum; print([e.value for e in ModelsEnum])"` to see all supported models.

### Defense Strategy

```yaml
config:
  defense: null                          # No defense (baseline)
  # defense: tool_filter                 # Filter suspicious tool calls
  # defense: spotlighting_with_delimiting # Mark data vs instructions
  # defense: repeat_user_prompt          # Reinforce user intent
```

### Attack Type

```yaml
config:
  attack: important_instructions   # Default - adds "IMPORTANT" prefix
  # attack: tool_knowledge         # Uses knowledge of available tools
  # attack: injecagent            # Sophisticated multi-step injection
  # attack: ignore_previous       # Classic "ignore previous instructions"
  # attack: direct                # Direct instruction injection
```

## Understanding Results

### Metrics

| Metric | Description | Goal |
|--------|-------------|------|
| **security** | Was the injection attack blocked? | Higher = better |
| **utility** | Did the agent complete the user's task? | Higher = better |
| **safe_utility** | Both secure AND useful? | Key metric to optimize |

### Interpreting Scores

| Security | Utility | Interpretation |
|----------|---------|----------------|
| 100% | 100% | Ideal - agent is secure and useful |
| 0% | 100% | **Dangerous** - works but compromised |
| 100% | 0% | Safe but broken - defense too aggressive |
| 0% | 0% | Total failure |

## Comparing Configurations

Add multiple providers to compare models or defenses:

```yaml
providers:
  - id: file://provider.py
    label: "GPT-4o (no defense)"
    config:
      model: gpt-4o-2024-05-13
      defense: null

  - id: file://provider.py
    label: "GPT-4o (tool_filter)"
    config:
      model: gpt-4o-2024-05-13
      defense: tool_filter

  - id: file://provider.py
    label: "Claude 3.5 Sonnet"
    config:
      model: claude-3-5-sonnet-20241022
      defense: null
```

## Files

| File | Description |
|------|-------------|
| `promptfooconfig.yaml` | Main Promptfoo configuration |
| `provider.py` | Python provider wrapping AgentDojo benchmark API |
| `graders.py` | Custom assertion graders for security metrics |
| `dataset.py` | Script to generate test dataset from AgentDojo tasks |
| `requirements.txt` | Python dependencies |

## Environment Suites

| Suite | Description | Example Tasks |
|-------|-------------|---------------|
| **Workspace** | Email, calendar, cloud storage | Send email, schedule meeting |
| **Travel** | Flight booking, hotel reservations | Book flight, find hotels |
| **Slack** | Team messaging, channel management | Send message, create channel |
| **Banking** | Account management, transfers | Check balance, transfer funds |

## Troubleshooting

### "No module named 'agentdojo'"

Make sure you're using the virtual environment Python:

```bash
source .venv/bin/activate
export PROMPTFOO_PYTHON="$(pwd)/.venv/bin/python"
```

### "X is not a valid ModelsEnum"

AgentDojo requires specific model version strings, not shorthand names. For example:
- Use `gpt-4o-2024-05-13` (not `gpt-4o`)
- Use `gpt-4o-mini-2024-07-18` (not `gpt-4o-mini`)

Check available models:
```bash
python -c "from agentdojo.agent_pipeline.agent_pipeline import ModelsEnum; print([e.value for e in ModelsEnum])"
```

### Slow execution

AgentDojo runs full agent interactions. For faster testing:

```bash
python dataset.py --suite workspace --max-user-tasks 2 --max-injection-tasks 1
```

### API rate limits

Set `maxConcurrency: 1` in `promptfooconfig.yaml` to run tasks sequentially.

### macOS "externally-managed-environment" error

Use a virtual environment instead of system Python:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Learn More

- [AgentDojo Documentation](https://agentdojo.spylab.ai/)
- [AgentDojo Paper (NeurIPS 2024)](https://arxiv.org/abs/2406.13352)
- [Promptfoo Documentation](https://www.promptfoo.dev/docs/intro)
- [NIST Blog on Agent Hijacking](https://www.nist.gov/news-events/news/2025/01/technical-blog-strengthening-ai-agent-hijacking-evaluations)
