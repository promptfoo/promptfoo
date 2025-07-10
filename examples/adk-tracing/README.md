# adk-tracing

This example demonstrates how to use OpenTelemetry tracing with promptfoo providers. It shows a Python implementation of a multi-agent system that makes real LLM calls with distributed tracing.

## Features

- **Multi-Agent System**: Demonstrates distributed tracing across multiple agent calls (process_request → research → summarize)
- **Real LLM Integration**: Makes actual OpenAI API calls using `gpt-4o-mini` model
- **OpenTelemetry Tracing**: Full trace context propagation with detailed span attributes
- **LLM Metrics**: Captures token usage, response lengths, and model information in traces
- **Error Handling**: Proper exception handling with trace error reporting

## Prerequisites

1. **OpenAI API Key**: You need an OpenAI API key to run this example
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

2. **Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Example

Run the evaluation with real LLM calls:

```bash
promptfoo eval
```

This will:
1. Start the OTLP receiver for collecting traces
2. Run test cases through the multi-agent system
3. Make real OpenAI API calls for research and summarization
4. Export detailed traces with LLM metrics

## Viewing Traces

After running evaluations, start the web viewer:

```bash
promptfoo view
```

Then:
1. Navigate to the evaluation results
2. Click on any test case output
3. Click the "View Trace" button to see the trace timeline

You'll see:
- Overall request processing time
- Individual agent execution times
- LLM token usage and costs
- Error traces if any API calls fail

## How It Works

### Agent Architecture

1. **Process Request Agent** (Coordinator)
   - Orchestrates the multi-agent workflow
   - Extracts trace context from promptfoo
   - Coordinates research and summary agents

2. **Research Agent**
   - Makes OpenAI API call to gather detailed information
   - Uses `gpt-4o-mini` with higher temperature for diverse insights
   - Captures token usage metrics in trace

3. **Summary Agent**
   - Takes research findings and creates executive summary
   - Uses `gpt-4o-mini` with lower temperature for consistency
   - Formats output with clear structure

### Trace Information

Each trace includes:
- **Span Hierarchy**: Shows the relationship between agents
- **Timing Data**: Execution time for each operation
- **LLM Metrics**: Token counts, model names, response lengths
- **Error Information**: Exceptions and error messages if failures occur

## Example Output

The agents will produce real, contextual responses like:

```
Executive Summary:

Main Points:
• Quantum computing leverages quantum mechanical phenomena for computation
• Recent breakthroughs include improved qubit stability and error correction
• Major tech companies and startups are racing toward quantum advantage
• Applications span cryptography, drug discovery, and optimization problems

Conclusion: Quantum computing is rapidly advancing from theoretical research 
to practical applications, with significant implications for multiple industries.
```

## Cost Considerations

This example makes real API calls to OpenAI:
- Each evaluation makes 2 API calls per test case
- Using `gpt-4o-mini` which is cost-effective
- Monitor your OpenAI usage dashboard

## Troubleshooting

1. **"OPENAI_API_KEY environment variable not set"**
   - Set your OpenAI API key: `export OPENAI_API_KEY="sk-..."`

2. **API Rate Limits**
   - The example includes reasonable delays
   - Reduce concurrency in promptfooconfig.yaml if needed

3. **Traces not appearing**
   - Ensure OTLP receiver started (check logs)
   - Wait a moment for spans to export
   - Check for errors in trace export logs
