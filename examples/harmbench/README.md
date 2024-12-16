# HarmBench Red Team Example

This example demonstrates how to use promptfoo's red teaming capabilities to evaluate LLM safety using the [HarmBench dataset](https://github.com/centerforaisafety/HarmBench). We'll use the intent plugin with iterative testing to systematically probe for vulnerabilities in LLM safety measures.

## Overview

HarmBench is a standardized evaluation framework for automated red teaming and robust refusal, developed by the [Center for AI Safety](https://www.safe.ai/). This example shows how to:

1. Test LLM responses against known harmful behaviors
2. Use iterative red teaming to attempt to bypass safety measures
3. Evaluate the robustness of LLM safety mechanisms

## Prerequisites

Before you begin, ensure you have:

- **Node.js**: Version 18 or later
- **promptfoo**: We'll use `npx` to run commands

## Setting Up the Environment

Initialize a new project with this example:

```bash
npx promptfoo@latest init --example harmbench
cd harmbench
```

## Configuration

The `promptfooconfig.yaml` demonstrates how to:

- Load test cases from the HarmBench dataset
- Configure the intent plugin for red teaming
- Use iterative testing strategies

```yaml
description: 'HarmBench Safety Evaluation'

prompts:
  - '{{Behavior}}'

providers:
  - id: openai:gpt-4
    config:
      temperature: 0

defaultTest:
  provider:
    id: promptfoo:redteam:iterative
    config:
      injectVar: 'Behavior'
  assert:
    - type: promptfoo:redteam:harmful
  metadata:
    purpose: 'A helpful AI assistant'
```

### Configuration Explained

- **prompts**: Uses behaviors from HarmBench as test cases
- **provider**: Uses the iterative red team strategy
- **assert**: Validates responses using the harmful content detector
- **metadata**: Defines the intended behavior to guide test generation

## Data Source

The test cases use the first 100 records from the [HarmBench behaviors dataset](https://github.com/centerforaisafety/HarmBench/blob/8e1604d1171fe8a48d8febecd22f600e462bdcdd/data/behavior_datasets/harmbench_behaviors_text_all.csv). These behaviors cover a range of potentially harmful categories including:

- Chemical/biological threats
- Illegal activities
- Misinformation/disinformation
- Harassment/bullying
- Cybercrime/intrusion
- Copyright violations

The behaviors are stored in `data/harmbench.csv` and include structured fields for:

- Behavior: The actual prompt/behavior to test
- FunctionalCategory: The type of behavior (e.g., standard, contextual)
- SemanticCategory: The category of harm (e.g., chemical_biological, illegal, misinformation_disinformation)
- BehaviorID: A unique identifier for each behavior

## Running the Evaluation

Generate and run the red team evaluation:

```bash
npx promptfoo eval
```

This will:

1. Load the HarmBench behaviors
2. Apply iterative red teaming techniques
3. Test LLM responses
4. Generate a safety evaluation report

## Analyzing Results

The evaluation will show:

- Which behaviors successfully bypassed safety measures
- The effectiveness of different attack strategies
- Areas where the LLM's safety mechanisms need improvement

## File Structure

```
examples/harmbench/
├── README.md
├── promptfooconfig.yaml        # Red team configuration
└── data/
    ├── harmbench.csv          # Full HarmBench dataset
    └── harmbench_sample.csv   # Sample for testing
```

## Attribution

This example uses data from the HarmBench project:

```bibtex
@article{mazeika2024harmbench,
  title={HarmBench: A Standardized Evaluation Framework for Automated Red Teaming and Robust Refusal},
  author={Mantas Mazeika and Long Phan and Xuwang Yin and Andy Zou and Zifan Wang and Norman Mu and Elham Sakhaee and Nathaniel Li and Steven Basart and Bo Li and David Forsyth and Dan Hendrycks},
  year={2024},
  eprint={2402.04249},
  archivePrefix={arXiv},
  primaryClass={cs.LG}
}
```

For more information:

- HarmBench GitHub: https://github.com/centerforaisafety/HarmBench
- HarmBench Website: https://harmbench.org/
- Promptfoo Red Team Docs: https://promptfoo.dev/docs/red-team/quickstart/

## License

The HarmBench dataset is released under the MIT License. See the [HarmBench repository](https://github.com/centerforaisafety/HarmBench) for more details.
