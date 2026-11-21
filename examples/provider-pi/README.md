# provider-pi (Pi Coding Agent Examples)

## Setup

### 1. Install the pi CLI

Use Linux or macOS. Install the Pi CLI in a trusted location outside the project.

```sh
npm install --global --ignore-scripts @earendil-works/pi-coding-agent@0.99.1
pi --list-models
```

### 2. Configure credentials

Set `OPENAI_API_KEY` in the shell that runs Promptfoo. The comparison also needs `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`. Do not put keys in the eval config.

## Examples

### Basic Usage

[Generate a Python function](./basic) in a temporary workspace.

### Working Directory

[Summarize sample.py](./working-dir) by including the file explicitly in the prompt.

### Model Comparison

[Compare three vendors](./model-comparison) on one Python task.

## Provider Configuration

These examples keep all tools disabled. Even read tools can reach outside the working directory if enabled. Run the following command from any example subdirectory.

```sh
npx promptfoo@latest eval
```

## Learn More

[Pi provider documentation](https://www.promptfoo.dev/docs/providers/pi/)
