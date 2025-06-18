# langflow (Langflow Integration)

You can run this example with:

```bash
npx promptfoo@latest init --example langflow
```

This example demonstrates how to evaluate AI flows created with [Langflow](https://www.langflow.org/) using Promptfoo. Langflow is a visual framework for building multi-agent and RAG applications. It provides a low-code approach to create complex AI workflows through a drag-and-drop interface.

## Prerequisites

Before running this example, you'll need:

1. **Langflow installed and running**:

   ```bash
   pip install langflow
   langflow run
   ```

   This will start Langflow at `http://localhost:7860`

2. **API Keys**: Set up your LLM provider API keys (e.g., OpenAI, Anthropic)

   ```bash
   export OPENAI_API_KEY=your_openai_key_here
   export ANTHROPIC_API_KEY=your_anthropic_key_here
   ```

3. **A Langflow API key**: Generate one using the Langflow CLI:
   ```bash
   langflow api-key
   ```
   Then set it as an environment variable:
   ```bash
   export LANGFLOW_API_KEY=your_langflow_api_key_here
   ```

## What This Example Does

This example:

1. **Creates a simple Langflow flow** with a basic chat interface that can handle various conversation types
2. **Evaluates the flow** using different prompts and test cases
3. **Compares performance** against a direct OpenAI API call to show the difference
4. **Tests flow robustness** with edge cases and different input types

The example flow includes:

- Chat Input component for user messages
- OpenAI model for processing
- Chat Output component for responses
- Custom prompting for consistent behavior

## Setup

1. **Start Langflow**:

   ```bash
   langflow run
   ```

2. **Import the example flow**:

   - Open Langflow in your browser (`http://localhost:7860`)
   - Import the flow from `basic_chat_flow.json`
   - Note the Flow ID from the URL or Publish panel

3. **Set up environment variables**:

   ```bash
   export LANGFLOW_API_KEY=sk-your-langflow-api-key-here
   export LANGFLOW_FLOW_ID=your-flow-id-here
   export OPENAI_API_KEY=sk-your-openai-key-here
   ```

   Or create a `.env` file:

   ```bash
   # Copy and customize these values
   LANGFLOW_URL=http://localhost:7860
   LANGFLOW_API_KEY=sk-your-langflow-api-key-here
   LANGFLOW_FLOW_ID=your-flow-id-here
   OPENAI_API_KEY=sk-your-openai-key-here
   ```

4. **Install Python dependencies**:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

5. **Verify your setup**:
   ```bash
   python test_setup.py
   ```
   This will check if Langflow is running, API keys are configured, and everything is ready for evaluation.

## Running the Evaluation

```bash
npx promptfoo eval
```

After the evaluation completes, view the results:

```bash
npx promptfoo view
```

## Understanding the Results

The evaluation will show:

- **Response Quality**: How well the Langflow flow handles different types of queries
- **Consistency**: Whether the flow provides consistent responses to similar inputs
- **Performance Comparison**: Direct API calls vs. Langflow flow processing
- **Edge Case Handling**: How the flow behaves with unusual or problematic inputs

## Customizing the Example

You can modify this example by:

1. **Creating your own Langflow flow** with different components (RAG, agents, tools, etc.)
2. **Adding more test cases** in the `promptfooconfig.yaml`
3. **Including custom assertions** to test specific flow behaviors
4. **Testing multiple flows** by adding more provider configurations

## Troubleshooting

- **Connection errors**: Ensure Langflow is running on the correct port
- **Authentication errors**: Verify your Langflow API key is set correctly
- **Flow not found**: Double-check the Flow ID in your configuration
- **Model errors**: Ensure your LLM provider API keys are configured in Langflow

For more information about Langflow, visit: https://www.langflow.org/
