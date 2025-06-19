# langflow (Langflow Integration)

You can run this example with:

```bash
npx promptfoo@latest init --example langflow
```

This example demonstrates how to evaluate AI flows created with [Langflow](https://www.langflow.org/) using Promptfoo. Langflow is a visual framework for building multi-agent and RAG applications through a drag-and-drop interface.

## Prerequisites

1. **Langflow installed and running**:
   ```bash
   pip install langflow
   langflow run
   ```
   This will start Langflow at `http://localhost:7860`

2. **API Keys**: Set up your LLM provider API keys:
   ```bash
   export OPENAI_API_KEY=your_openai_key_here
   ```

3. **A Langflow API key**: Generate one using the Langflow CLI:
   ```bash
   langflow api-key
   ```

## Setup

1. **Start Langflow**:
   ```bash
   langflow run
   ```

2. **Import the example flow**:
   - Open Langflow in your browser (`http://localhost:7860`)
   - Import the flow from `basic_chat_flow.json`
   - Note the Flow ID from the URL or Publish panel

3. **Set environment variables**:
   ```bash
   export LANGFLOW_API_KEY=sk-your-langflow-api-key-here
   export LANGFLOW_FLOW_ID=your-flow-id-here
   export OPENAI_API_KEY=sk-your-openai-key-here
   ```

4. **Install Python dependencies**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

## Running the Evaluation

```bash
npx promptfoo eval
```

After the evaluation completes, view the results:

```bash
npx promptfoo view
```

## What This Example Does

This example:
- **Creates a simple Langflow flow** with a basic chat interface
- **Evaluates the flow** using different prompts and test cases  
- **Compares performance** against a direct OpenAI API call
- **Tests flow robustness** with various input types

The evaluation includes tests for:
- Response quality and consistency
- Code generation capabilities  
- Handling of different query types
- Edge case scenarios

## Troubleshooting

- **Connection errors**: Ensure Langflow is running on `http://localhost:7860`
- **Authentication errors**: Verify your Langflow API key is set correctly
- **Flow not found**: Double-check the Flow ID in your environment variables
- **Model errors**: Ensure your OpenAI API key is configured

For more information about Langflow, visit: https://www.langflow.org/
