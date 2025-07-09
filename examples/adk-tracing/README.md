# adk-tracing (Google Agent Development Kit with OpenTelemetry Tracing)

You can run this example with:

```bash
npx promptfoo@latest init --example adk-tracing
```

Or test locally with:

```bash
npm run local -- eval -c examples/adk-tracing/promptfooconfig.yaml
```

This example demonstrates how to use OpenTelemetry tracing with Google's Agent Development Kit (ADK) in promptfoo evaluations. It shows how multi-agent systems create rich traces that help debug and optimize complex agent workflows.

## Overview

This example showcases:

- A multi-agent ADK system with specialized agents
- OpenTelemetry instrumentation for each agent's operations
- Trace visualization in promptfoo's web UI
- Assertions based on trace data (span counts, durations, errors)

The example implements a research assistant system with:

1. **Coordinator Agent** - Routes queries to specialized agents
2. **Research Agent** - Performs document retrieval and analysis
3. **Fact Checker Agent** - Verifies information accuracy
4. **Summary Agent** - Generates concise summaries

**Note**: For simplicity, the current implementation uses mock responses instead of actual ADK agents. This allows you to test the tracing infrastructure without setting up Google AI Studio. To use real ADK agents, uncomment the agent code in `run_agent.py` and ensure you have a valid Google API key.

## Prerequisites

1. **Python 3.9+** with pip
2. **Google AI Studio API Key** (for Gemini models)
3. **Environment Variables**:

   ```bash
   # Required
   export GOOGLE_API_KEY=your-google-ai-studio-api-key
   ```

   You can get an API key from [Google AI Studio](https://aistudio.google.com/apikey).

## Installation

1. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Install Node.js dependencies (for promptfoo):
   ```bash
   npm install
   ```

## Project Structure

```
adk-tracing/
├── agents/
│   ├── __init__.py
│   ├── coordinator.py    # Main coordinator agent
│   ├── research.py       # Research agent with RAG
│   ├── fact_checker.py   # Fact verification agent
│   └── summary.py        # Summarization agent
├── provider.js           # Promptfoo provider with tracing
├── promptfooconfig.yaml  # Evaluation configuration
├── requirements.txt      # Python dependencies
└── README.md            # This file
```

## How It Works

### 1. ADK Multi-Agent System

The coordinator agent receives queries and delegates to specialized agents:

```python
# agents/coordinator.py
from google import genai
from google.genai.types import FunctionDeclaration, Schema

class CoordinatorAgent:
    def __init__(self):
        self.client = genai.Client()  # Uses Google AI Studio
        self.model = self.client.models.get("gemini-2.5-flash")

    async def process(self, query: str, trace_context: dict):
        # Agent logic with tracing
        ...
```

### 2. OpenTelemetry Integration

Each agent instruments its operations with spans:

```python
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

tracer = trace.get_tracer(__name__)

async def process_with_tracing(self, query: str, context: dict):
    # Extract parent trace context
    parent_ctx = extract_trace_context(context)

    with tracer.start_as_current_span(
        "research_agent.process",
        context=parent_ctx,
        attributes={
            "agent.type": "research",
            "query.text": query,
            "query.length": len(query)
        }
    ) as span:
        try:
            # Retrieve documents
            with tracer.start_span("retrieve_documents") as retrieve_span:
                documents = await self.retrieve_docs(query)
                retrieve_span.set_attribute("documents.count", len(documents))

            # Analyze content
            with tracer.start_span("analyze_content") as analyze_span:
                analysis = await self.analyze(documents)
                analyze_span.set_attribute("analysis.score", analysis.score)

            span.set_status(Status(StatusCode.OK))
            return analysis

        except Exception as e:
            span.record_exception(e)
            span.set_status(Status(StatusCode.ERROR, str(e)))
            raise
```

### 3. Promptfoo Provider

The provider integrates ADK agents with promptfoo's tracing:

```javascript
// provider.js
const { spawn } = require('child_process');

class ADKProvider {
  async callApi(prompt, context) {
    // Pass trace context to Python agent
    const result = await this.runPythonAgent(prompt, {
      traceparent: context.traceparent,
      evaluationId: context.evaluationId,
      testCaseId: context.testCaseId,
    });

    return { output: result };
  }
}
```

### 4. Trace Assertions

The configuration includes trace-based assertions:

```yaml
defaultTest:
  assert:
    # Ensure all agents participate
    - type: trace-span-count
      value:
        pattern: '*_agent.process'
        min: 3 # Coordinator, Research, Summary

    # Monitor retrieval performance
    - type: trace-span-duration
      value:
        pattern: 'retrieve_documents'
        max: 500 # Max 500ms for document retrieval

    # No errors allowed
    - type: trace-error-spans
      value:
        max_count: 0
```

## Running the Example

There are two configurations available:

1. **Simple configuration** (recommended for testing):

   ```bash
   npm run local -- eval -c examples/adk-tracing/promptfooconfig-simple.yaml
   ```

2. **Full configuration** with advanced trace assertions:

   ```bash
   npm run local -- eval -c examples/adk-tracing/promptfooconfig.yaml
   ```

3. **View results and traces**:

   ```bash
   npm run local -- view
   ```

4. **In the web UI**:
   - Click on any test result
   - Look for the magnifying glass (🔎) icon
   - Scroll to "Trace Timeline" to see the multi-agent execution flow

## Expected Trace Timeline

A successful execution shows a trace like:

```
[coordinator_agent.process (850ms)]
  ├─[route_decision (120ms)]
  ├─[research_agent.process (500ms)]
  │  ├─[retrieve_documents (200ms)]
  │  ├─[analyze_content (250ms)]
  │  └─[format_results (50ms)]
  ├─[fact_checker_agent.process (180ms)]
  │  ├─[verify_claims (150ms)]
  │  └─[confidence_scoring (30ms)]
  └─[summary_agent.process (50ms)]
     └─[generate_summary (45ms)]
```

## Extending the Example

### Add More Agents

Create a new agent in `agents/` following the pattern:

```python
class NewAgent:
    async def process_with_tracing(self, query: str, context: dict):
        with tracer.start_as_current_span("new_agent.process"):
            # Your agent logic here
            pass
```

### Custom Trace Attributes

Add domain-specific attributes to spans:

```python
span.set_attributes({
    "documents.source": "arxiv",
    "confidence.score": 0.95,
    "tokens.used": 1250,
    "cache.hit": True
})
```

### Performance Monitoring

Add percentile-based monitoring:

```yaml
assert:
  - type: trace-span-duration
    value:
      pattern: '*'
      percentile: 95
      max: 1000
    metric: p95_latency
```

## Best Practices

1. **Semantic Span Names**: Use hierarchical names like `agent_name.operation`
2. **Error Handling**: Always record exceptions and set error status
3. **Attribute Selection**: Include relevant attributes without over-instrumenting
4. **Context Propagation**: Ensure trace context flows through all agents
5. **Performance**: Use BatchSpanProcessor in production for better performance

## Troubleshooting

### Traces Not Appearing

1. Check that tracing is enabled in `promptfooconfig.yaml`
2. Verify OTLP receiver is running (check logs)
3. Ensure agents are properly extracting trace context
4. Check Python OpenTelemetry setup

### Missing Spans

- Verify all agents have tracing instrumentation
- Check that parent context is properly propagated
- Look for exceptions that might interrupt span creation

### Performance Issues

- Use sampling for high-volume scenarios
- Consider BatchSpanProcessor instead of SimpleSpanProcessor
- Monitor span attribute sizes

## Learn More

- [ADK Documentation](https://cloud.google.com/agent-builder/docs/adk)
- [promptfoo Tracing Guide](https://promptfoo.dev/docs/configuration/tracing)
- [OpenTelemetry Python](https://opentelemetry.io/docs/languages/python/)
- [Google AI Studio](https://aistudio.google.com/)
