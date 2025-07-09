# adk-tracing (Google ADK OpenTelemetry Tracing)

This example demonstrates OpenTelemetry tracing with a multi-agent system inspired by Google's Agent Development Kit (ADK).

You can run this example with:

```bash
npx promptfoo@latest init --example adk-tracing
```

## Overview

This example shows how to instrument multi-agent systems with OpenTelemetry traces to debug and optimize complex workflows. It includes:

- Multi-agent coordinator pattern with specialized agents
- Hierarchical trace visualization in promptfoo's web UI
- Trace-based assertions for performance monitoring
- Optional real LLM integration with OpenAI

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` (optional) - Your OpenAI API key for real LLM calls
- `GOOGLE_API_KEY` (optional) - For future ADK integration

You can set these in a `.env` file or directly in your environment.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   pip install -r requirements.txt
   ```

2. Run the evaluation:
   ```bash
   # Simple version (mock responses only)
   npx promptfoo eval -c promptfooconfig-simple.yaml

   # With LLM calls (requires OPENAI_API_KEY)
   npx promptfoo eval -c promptfooconfig-llm.yaml

   # Full version with advanced assertions
   npx promptfoo eval -c promptfooconfig.yaml
   ```

3. View traces:
   ```bash
   npx promptfoo view
   ```

   Click the 🔎 icon on any test result to see the trace timeline.

## Agent Architecture

The system simulates a research assistant with four specialized agents:

```
[Coordinator Agent]
    ├─→ [Research Agent] - Document retrieval & analysis
    ├─→ [Fact Checker] - Claim verification
    └─→ [Summary Agent] - Executive summary generation
```

Each agent creates OpenTelemetry spans to track:
- Operation timing and dependencies
- Success/failure status
- Custom attributes (document count, confidence scores, etc.)

## Trace Visualization

A successful trace shows the multi-agent workflow:

```
[coordinator_agent.process (850ms)]
  ├─[route_decision (50ms)]
  ├─[research_agent.process (400ms)]
  │  ├─[retrieve_documents (100ms)]
  │  ├─[analyze_content (250ms)]
  │  │  └─[openai.chat.completion (200ms)] ← Real LLM call
  │  └─[format_results (50ms)]
  ├─[fact_checker_agent.process (180ms)]
  │  ├─[verify_claims (150ms)]
  │  └─[confidence_scoring (30ms)]
  └─[summary_agent.process (220ms)]
     └─[generate_summary (215ms)]
        └─[openai.chat.completion (180ms)] ← Real LLM call
```

## Configuration Options

### Mock Provider (No API Keys Required)

```yaml
providers:
  - id: file://provider-with-traces.js
```

### LLM Provider (Requires OpenAI API Key)

```yaml
providers:
  - id: file://provider-with-llm.js
    config:
      model: gpt-4o-mini  # or gpt-4o, gpt-3.5-turbo
```

## Trace Assertions

The example includes several trace assertion types:

```yaml
# Verify agent participation
- type: trace-span-count
  value:
    pattern: '*_agent.process'
    min: 3

# Monitor performance
- type: trace-span-duration
  value:
    pattern: 'retrieve_documents'
    max: 500  # milliseconds

# Check for errors
- type: trace-error-spans
  value:
    max_count: 0
```

## Customization

### Add a New Agent

1. Create `agents/new_agent.py`:
   ```python
   async def process(self, query: str, parent_context):
       with tracer.start_span("new_agent.process"):
           # Your logic here
   ```

2. Update the coordinator to route to your agent

3. Add assertions for the new spans

### Custom Trace Attributes

```javascript
span.setAttributes({
  'cache.hit': true,
  'model.temperature': 0.7,
  'tokens.total': 1250,
});
```

## Troubleshooting

**Traces not appearing?**
- Ensure `tracing.enabled: true` in config
- Check that port 4318 is available
- Look for OTLP receiver logs in console

**Missing spans?**
- Verify trace context propagation
- Check for exceptions in agent code
- Enable debug logging: `DEBUG=promptfoo:* npx promptfoo eval`

## Learn More

- [promptfoo Tracing Documentation](https://promptfoo.dev/docs/configuration/tracing)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [Google ADK Documentation](https://cloud.google.com/agent-builder/docs/adk)
