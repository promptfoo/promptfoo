# Google Vertex AI - System Instructions from File

This example demonstrates how to load system instructions from an external file for Google Vertex AI Gemini models.

## Features

- Load system instructions using the `file://` prefix
- Works with all Gemini model configurations
- Supports both text and JSON response formats

## Usage

```yaml
providers:
  - id: vertex:gemini-1.5-flash-002
    config:
      systemInstruction: file://system-instruction.txt
```

The system instruction file can contain any text that you want to use as the system prompt for the model.

## Running the Example

1. Make sure you have Google Cloud credentials configured
2. Run the evaluation:

```bash
promptfoo eval
```

## System Instruction Format

The system instruction can be provided in multiple ways:

1. **Direct text in config:**

   ```yaml
   systemInstruction: 'You are a helpful assistant'
   ```

2. **From a file (as shown in this example):**

   ```yaml
   systemInstruction: file://path/to/instruction.txt
   ```

3. **As a structured content object:**
   ```yaml
   systemInstruction:
     parts:
       - text: 'You are a helpful assistant'
   ```

The file-based approach is particularly useful for:

- Reusing system instructions across multiple configurations
- Managing long or complex system prompts
- Version controlling system instructions separately
