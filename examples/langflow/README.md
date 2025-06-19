# langflow (Langflow Integration)

You can run this example with:

```bash
npx promptfoo@latest init --example langflow
```

This example demonstrates how to evaluate AI flows created with [Langflow](https://www.langflow.org/) using Promptfoo. Langflow is a visual framework for building multi-agent and RAG applications through a drag-and-drop interface.

## Quick Start (Demo Mode)

The example includes a **demo mode** that works out of the box without requiring Langflow setup:

```bash
npx promptfoo eval
```

This will run the evaluation using mock responses that simulate a Langflow workflow, so you can see how the integration works before setting up the real thing.

## Real Langflow Integration

To use with your actual Langflow flows:

### Prerequisites

1. **Langflow installed and running**:
   ```bash
   pip install langflow
   langflow run
   ```
   This will start Langflow at `http://localhost:7860`

2. **A Langflow API key**: Generate one using the Langflow CLI:
   ```bash
   langflow api-key
   ```

### Setup

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
   ```

4. **Install Python dependencies**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

## Running the Evaluation

**Demo mode** (no setup required):
```bash
npx promptfoo eval
```

**Real Langflow** (after setup):
```bash
npx promptfoo eval
```

After the evaluation completes, view the results:
```bash
npx promptfoo view
```

## What This Example Does

This example:
- **Demonstrates Langflow integration** with Promptfoo's evaluation framework
- **Tests different types of queries** (greetings, knowledge questions, code generation, math)
- **Shows both demo and real modes** for easy testing and production use
- **Validates response quality** using multiple assertion types

The evaluation includes tests for:
- Response completeness and relevance
- Code generation capabilities  
- Mathematical problem solving
- Empty input handling

## Demo vs Real Mode

| Mode | API Key Required | Langflow Required | Responses                                  |
| ---- | ---------------- | ----------------- | ------------------------------------------ |
| Demo | No               | No                | Mock responses for testing                 |
| Real | Yes              | Yes               | Live responses from your Langflow workflow |

## Troubleshooting

- **Demo mode not working**: Ensure no environment variables are set, or set them to "demo"
- **Connection errors**: Ensure Langflow is running on `http://localhost:7860`
- **Authentication errors**: Verify your Langflow API key is set correctly
- **Flow not found**: Double-check the Flow ID in your environment variables

For more information about Langflow, visit: https://www.langflow.org/
