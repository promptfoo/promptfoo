# Agent Framework Comparison with OpenTelemetry Tracing

This example demonstrates how to compare multiple agent frameworks side-by-side using Promptfoo, with comprehensive OpenTelemetry tracing to understand performance characteristics and behavior differences.

## Overview

Compare the following agent frameworks in a single evaluation:
- **PydanticAI** - Structured outputs with type safety
- **Mozilla Any-Agent** - Framework-agnostic interface (TinyAgents & LangChain)
- **OpenAI Agents SDK** - Multi-agent coordination
- **LangChain ReAct** - Tool-using reasoning agent
- **Direct LLM** - Baseline comparison without agent framework

## Features

- Side-by-side performance comparison
- OpenTelemetry tracing for each framework
- Tool usage tracking
- Response quality metrics
- Latency measurements
- Error handling evaluation

## Setup

### 1. Install Dependencies

```bash
# Python dependencies
pip install -r requirements.txt

# Node.js dependencies
npm install
```

### 2. Set Environment Variables

```bash
export OPENAI_API_KEY="your-openai-key"
export ANTHROPIC_API_KEY="your-anthropic-key"  # Optional
```

### 3. Run the Comparison

```bash
npx promptfoo eval
```

### 4. View Results with Tracing

```bash
npx promptfoo view
```

Click on any test result's magnifying glass icon to see the trace timeline.

## What's Being Compared

### 1. **Response Quality**
- Accuracy of answers
- Completeness of multi-step tasks
- Structured output formatting

### 2. **Performance**
- Response latency
- Token usage
- Tool call efficiency

### 3. **Capabilities**
- Tool usage (calculator, weather)
- Multi-step reasoning
- Error handling
- Context awareness

### 4. **Tracing Insights**
- Framework initialization time
- Tool execution duration
- Agent reasoning steps
- Error recovery patterns

## Test Scenarios

1. **Simple Query** - Basic weather information request
2. **Multi-step Task** - Complex trip planning with multiple requirements
3. **Tool Usage** - Mathematical calculations requiring tools
4. **Error Handling** - Impossible requests (e.g., "book flight to Mars")
5. **Context Awareness** - Personalized recommendations

## Understanding the Traces

Each framework emits different trace patterns:

### PydanticAI Traces
```
pydantic-ai.call_api
  └── pydantic_ai.run
      └── llm.call
```
- Shows structured output generation
- Tracks validation steps
- Measures serialization overhead

### Any-Agent Traces
```
any-agent.call_api
  └── anyagent.{framework}
      └── agent.run
          └── framework.specific.operations
```
- Compares different underlying frameworks
- Shows framework switching overhead
- Tracks adapter performance

### OpenAI Agents Traces
```
openai-agents.call_api
  └── openai_agents.run
      └── swarm.run
          └── agent.handoff (if multi-agent)
```
- Shows agent coordination
- Tracks message passing
- Measures handoff latency

### LangChain ReAct Traces
```
langchain-react.call_api
  └── langchain.react.run
      ├── llm.reasoning
      └── tool.{name}
          └── tool.execution
```
- Shows reasoning steps
- Tracks tool calls
- Measures planning overhead

## Analyzing Results

### In the Web UI

1. **Compare Scores** - See which frameworks perform best on each test
2. **View Traces** - Click the 🔎 icon to see execution timeline
3. **Export Results** - Download as JSON for further analysis

### Key Metrics to Compare

- **Latency** - Which framework responds fastest?
- **Accuracy** - Which gives the best answers?
- **Token Usage** - Which is most efficient?
- **Tool Usage** - Which uses tools most effectively?
- **Error Rate** - Which handles errors best?

## Customization

### Add More Frameworks

1. Create a new provider in `providers/`
2. Use the shared tracing utilities:
   ```python
   from tracing_utils import create_traced_provider
   
   call_api = create_traced_provider(
       your_provider_function,
       service_name="your-framework",
       provider_type="your-type"
   )
   ```

3. Add to `promptfooconfig.yaml`:
   ```yaml
   providers:
     - id: your-framework
       python: providers/your_provider.py
   ```

### Add More Tests

Add test cases to evaluate specific capabilities:

```yaml
tests:
  - vars:
      task: "Your specific test scenario"
    assert:
      - type: llm-rubric
        value: "Expected behavior"
      - type: latency
        threshold: 3000
```

### Configure Tracing

Modify tracing settings in `promptfooconfig.yaml`:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318  # Change if needed
  forwarding:
    enabled: true
    endpoint: 'http://your-collector:4318'  # Send to external collector
```

## Interpreting Trace Data

### Performance Patterns

1. **Initialization Overhead** - Some frameworks have higher startup costs
2. **Tool Call Latency** - Compare tool execution times
3. **Reasoning Steps** - See how many LLM calls each framework makes
4. **Caching Benefits** - Identify when frameworks reuse computations

### Common Issues

1. **Timeout Errors** - Check trace for slow operations
2. **Tool Failures** - See which step failed in the trace
3. **Context Loss** - Trace shows where context wasn't propagated
4. **Rate Limits** - Identify throttling in trace timings

## Best Practices

1. **Run Multiple Times** - Results can vary, especially for complex tasks
2. **Check Traces** - Don't just compare scores, understand why
3. **Test Edge Cases** - Include error scenarios and edge cases
4. **Monitor Resources** - Some frameworks use more memory/CPU
5. **Consider Context** - Choose frameworks based on your use case

## Next Steps

- Add more agent frameworks to the comparison
- Create domain-specific test scenarios
- Export traces to external observability platforms
- Build automated framework selection based on task type
- Create performance regression tests

## Troubleshooting

### Traces Not Appearing

1. Ensure tracing is enabled in config
2. Check OTLP receiver is running (port 4318)
3. Verify providers are using trace context

### Framework Errors

1. Check API keys are set correctly
2. Ensure all dependencies are installed
3. Review framework-specific logs in traces

### Performance Issues

1. Some frameworks are slower on first run (cold start)
2. Tool timeouts may need adjustment
3. Consider using sampling for large evaluations 