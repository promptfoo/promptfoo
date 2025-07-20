# ARC-AGI Evaluation with promptfoo

This example demonstrates how to evaluate AI models on the ARC-AGI (Abstraction and Reasoning Corpus for Artificial General Intelligence) benchmark using promptfoo. ARC-AGI tests for general intelligence by measuring skill acquisition rather than just skill application.

## Overview

ARC-AGI comes in several versions:
- **ARC-AGI-1 and ARC-AGI-2**: Traditional grid-based puzzle tasks where models must identify patterns from examples and apply them to test cases
- **ARC-AGI-3**: Game-based tasks where agents interact with an API to play various games

This example supports evaluating both types of tasks using promptfoo's flexible evaluation framework.

## Features

- Evaluate multiple models (Claude, GPT-4, o1, etc.) on ARC-AGI tasks
- Support for both grid-based puzzles (ARC-AGI-1/2) and game-based tasks (ARC-AGI-3)
- Custom evaluation functions to check for pixel-perfect accuracy
- Multiple solving strategies:
  - Direct prompting
  - Chain-of-thought reasoning
  - Program synthesis approaches
  - Test-time training (TTT) simulation
- Detailed performance metrics and visualizations

## Getting Started

### Prerequisites

1. Install promptfoo:
```bash
npm install -g promptfoo
```

2. Set up API keys for the models you want to test:
```bash
export OPENAI_API_KEY=your_openai_key
export ANTHROPIC_API_KEY=your_anthropic_key
```

3. For ARC-AGI-3 game-based evaluation, you'll also need:
```bash
export ARC_API_KEY=your_arc_api_key  # Get from https://three.arcprize.org/
```

### Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example arc-agi
```

Or if you already have the files:

1. Evaluate models on sample ARC-AGI tasks:
```bash
# Simple evaluation with 2 models on 1 task
promptfoo eval -c arc-agi-simple.yaml

# Full evaluation with multiple strategies
promptfoo eval -c promptfooconfig.yaml

# Test Python code execution
promptfoo eval -c arc-agi-python-exec.yaml

# Test ARC-AGI-3 game agents
promptfoo eval -c arc-agi-3-agent.yaml
```

2. View results in the web UI:
```bash
promptfoo view
```

## Configuration

The example includes multiple configuration files:

1. **promptfooconfig.yaml** - Main config with multiple evaluation strategies
2. **arc-agi-simple.yaml** - Simple config for quick testing  
3. **arc-agi-python-exec.yaml** - Evaluates models by executing their Python code
4. **arc-agi-3-agent.yaml** - For evaluating ARC-AGI-3 game agents
5. **arc-agi-3-game.yaml** - Conceptual example for game-based evaluation

Each configuration defines:
- Which models to evaluate
- The ARC-AGI tasks to test on
- Evaluation strategies and prompts
- Custom assertion functions

## Evaluation Strategies

### 1. Direct Prompting
Simple approach where the model is shown examples and asked to solve the test case.

### 2. Chain-of-Thought Reasoning
Model is prompted to explain its reasoning step-by-step before providing the answer.

### 3. Program Synthesis
Model attempts to write a program that transforms inputs to outputs based on the examples.

### 4. Python Code Execution (NEW!)
Models write Python functions that are actually executed to solve tasks:
- Safe execution in isolated environment (5-second timeout)
- Automatic extraction of code from model responses
- Detailed error reporting if code fails
- Perfect for testing if models truly understand the pattern

**How it works:**
1. Model generates a `transform(input_grid)` function
2. The function is executed with the test input
3. Output is compared pixel-by-pixel with expected result
4. Both syntax errors and logic errors are reported

**Example usage:**
```bash
# Run Python execution tests
promptfoo eval -c arc-agi-python-exec.yaml

# Test a simple pattern
promptfoo eval -c arc-agi-python-test.yaml
```

### 5. Test-Time Training Simulation
Simulates fine-tuning on the task examples before solving (requires specific model support).

## Understanding Results

- **Accuracy**: Percentage of tasks solved correctly (pixel-perfect match)
- **Partial Accuracy**: Percentage of pixels correctly predicted
- **Cost per Task**: Average cost to solve each task
- **Time per Task**: Average time taken per task

## Advanced Usage

### Adding New Tasks

1. For grid-based tasks (ARC-AGI-1/2):
   - Add task JSON files to `tasks/grid/`
   - Update `promptfooconfig.yaml` to include new tasks

2. For game-based tasks (ARC-AGI-3):
   - Configure game IDs in `tasks/games/`
   - Set up appropriate game agent templates

### Custom Evaluation Functions

See `evaluators/` directory for custom evaluation logic:
- `grid_evaluator.js`: Checks pixel-perfect accuracy for grid tasks
- `game_evaluator.js`: Evaluates game-based task performance

## Resources

- [ARC Prize Official Guide](https://arcprize.org/guide)
- [ARC-AGI-2 Technical Report](https://arcprize.org/blog/arc-agi-2-technical-report)
- [ARC-AGI-3 Documentation](https://three.arcprize.org/docs)
- [promptfoo Documentation](https://www.promptfoo.dev/docs/intro)

## Example Structure

```
arc-agi/
├── README.md                        # This file
├── promptfooconfig.yaml             # Main config with multiple strategies
├── arc-agi-simple.yaml              # Simple config for quick testing
├── arc-agi-python-exec.yaml         # Config with Python code execution
├── arc-agi-python-test.yaml         # Simple test for Python execution
├── arc-agi-3-agent.yaml             # ARC-AGI-3 game agent evaluation
├── arc-agi-3-game.yaml              # Conceptual game-based evaluation
├── INSIGHTS.md                      # Key findings and best practices
├── ARC-AGI-3-GUIDE.md               # Guide for ARC-AGI-3 integration
├── tasks/
│   └── grid/                        # Grid-based ARC-AGI tasks
│       ├── sample_task_1.json       # Sample task with 3x3 to 9x9 pattern
│       └── sample_task_2.json       # Sample task with doubling pattern
└── evaluators/
    ├── arc_grid_evaluator.js        # Custom evaluator for grid tasks
    ├── python_executor.js           # Executes Python code for evaluation
    └── arc_agi_3_agent_evaluator.js # Evaluates game agent actions
```

## Task Patterns

The included sample tasks demonstrate different types of patterns:

1. **sample_task_1.json**: A 3x3 grid is replicated in a 3x3 arrangement to form a 9x9 grid
2. **sample_task_2.json**: The input grid dimensions are doubled in both directions

These simple patterns help test basic pattern recognition capabilities before moving to more complex ARC-AGI tasks.

## Contributing

Feel free to submit issues or pull requests to improve this example! 