# Google ADK Agents Example - Enhanced with Gemini 2.5 Flash

This example demonstrates cutting-edge multi-agent development using Google's Agent Development Kit (ADK) with the latest **Gemini 2.5 Flash** model and 2025 best practices.

## 🚀 What's New in This Enhanced Version

- **Gemini 2.5 Flash with Thinking Mode**: Leverages Google's latest reasoning model that can "think" through complex problems
- **Advanced Tool Integration**: Built-in Google Search, code execution, and ready-to-use patterns for OpenAPI, MCP, and LangChain tools
- **Smart Callbacks**: Implements guardrails, caching, and dynamic thinking budget allocation
- **Production-Ready Features**: Session management, artifact handling, performance monitoring, and health checks
- **65K Token Output**: Supports massive responses for comprehensive travel planning
- **Auto-Thinking Mode**: Model automatically decides when deep reasoning is needed

## Overview

This enhanced travel planning system showcases:
- **Gemini 2.5 Flash** - Google's first fully hybrid reasoning model (April 2025)
- **Thinking Capabilities** - Controllable reasoning with budgets from 0 to 24,576 tokens
- **Real-time Search** - Integrated Google Search for current prices and availability
- **Smart Calculations** - Code execution for budget optimization and comparisons
- **Advanced Patterns** - Callbacks for caching, state management, and policy enforcement
- **OpenTelemetry Tracing** - Comprehensive debugging and performance monitoring
- **Future-Ready Architecture** - Prepared for OpenAPI tools, MCP servers, and more

## Key Features

### 🧠 Thinking Mode
- **Auto Mode**: Model decides when to think based on query complexity
- **Controllable Budget**: Fine-tune thinking from 0 (instant) to 24K tokens (deep analysis)
- **Optimized Performance**: Simple queries stay fast, complex ones get thorough analysis

### 🛠️ Advanced Tool Ecosystem
- **Built-in Tools**: Google Search and code execution ready to use
- **OpenAPI Integration**: Convert any REST API to an ADK tool
- **MCP Support**: Connect to Model Context Protocol servers
- **LangChain Tools**: Use Tavily, SerpAPI, and more
- **Caching Tools**: Smart caching to avoid redundant API calls

### 📊 Production Features
- **Session Management**: Context preservation across conversations
- **Artifact Storage**: Save itineraries and travel plans
- **Performance Monitoring**: Track response times and optimization
- **Health Checks**: Monitor system status and error rates
- **Graceful Degradation**: Fallback strategies for resilience

## Setup

1. **Install Dependencies**

```bash
pip install -r requirements.txt
```

2. **Set up Google AI API Key**

Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey) and set it:

```bash
export GOOGLE_API_KEY=your_api_key_here
```

Or create a `.env` file:

```bash
GOOGLE_API_KEY=your_api_key_here
GOOGLE_CLOUD_PROJECT=your-project-id  # Optional: for advanced features
```

## Running Tests

### Quick Start with Promptfoo

```bash
# Run comprehensive test suite
npx promptfoo@latest eval

# View results in web UI
npx promptfoo@latest view
```

### Test Thinking Mode Demo

See how thinking improves responses:

```bash
python test_thinking_demo.py
```

This demonstrates:
- Simple queries (no thinking needed)
- Medium complexity (moderate thinking)  
- High complexity (deep reasoning with optimization)
- Comparison with/without thinking mode

### Production Testing

```bash
# Run with full monitoring
python -m agent_runner

# Check health status
curl http://localhost:8080/health
```

## Architecture

```
google-adk-agents/
├── agents/
│   └── coordinator.py    # Enhanced with Gemini 2.5 Flash + callbacks
├── tools/
│   ├── weather_tool.py   # Basic tool example
│   ├── destination_tool.py
│   └── advanced_tools.py # OpenAPI, MCP, LangChain, caching examples
├── agent_runner.py       # Production-ready runner with monitoring
├── provider.py          # Clean Promptfoo interface
├── test_thinking_demo.py # Thinking mode demonstration
└── promptfooconfig.yaml # Advanced test scenarios
```

## Example: Thinking Mode in Action

### Simple Query (No Thinking)
```python
"What's the weather in Paris?"
# → Quick, direct response in <1 second
```

### Complex Query (Deep Thinking)
```python
"""Plan a 14-day Europe trip for $3000. 
   Optimize route through Paris, Rome, Barcelona, Amsterdam.
   Calculate all costs and minimize travel time."""
# → Deep analysis with route optimization, cost breakdowns
```

## Advanced Usage

### 1. Enable Thinking Mode

```python
from google.adk.agents import Agent

agent = Agent(
    model="gemini-2.5-flash-preview-05-20",
    config={
        "thinking_mode": "auto",  # or set specific budget
        "max_output_tokens": 65000
    }
)
```

### 2. Add Callbacks for Smart Behavior

```python
@callbacks.before_model_callback
def enhance_with_thinking(llm_request, context):
    """Dynamically set thinking budget based on complexity"""
    if "optimize" in llm_request.contents[0].text:
        llm_request.config.thinking_config = {
            "thinking_budget": 8192
        }
```

### 3. Integrate Advanced Tools

```python
# OpenAPI Tools
flight_tools = OpenAPIToolset(
    spec_path="https://api.airline.com/openapi.json"
)

# MCP Tools  
maps_client = McpClient("npx", ["@modelcontextprotocol/server-googlemaps"])
maps_tools = McpToolset(maps_client)

# Add to agent
agent.tools.extend(flight_tools.get_tools())
agent.tools.extend(maps_tools.get_tools())
```

### 4. Production Monitoring

```python
# Use the production runner
from agent_runner import production_runner

result = await production_runner.run_with_monitoring(
    prompt="Plan my trip",
    enable_caching=True,
    save_artifacts=True
)

# Check health
health = await production_runner.health_check()
```

## Test Scenarios

The enhanced test suite includes:

1. **Simple Queries** - Test fast responses without thinking
2. **Complex Optimization** - Multi-city routes with budget constraints
3. **Real-time Search** - Current prices and availability
4. **Budget Calculations** - Math with currency conversions
5. **Comparative Analysis** - Destination comparisons with pros/cons
6. **Context Retention** - Follow-up questions using session state
7. **Error Handling** - Graceful handling of impossible requests
8. **Structured Output** - JSON responses for integration
9. **Large Outputs** - 30-day comprehensive travel plans
10. **Tool Integration** - Multiple tools working together

## Performance Optimization

- **Thinking Budget**: Automatically adjusted based on query complexity
- **Response Caching**: Avoid redundant API calls for similar queries
- **Session Management**: Preserve context across conversations
- **Parallel Tool Execution**: Run multiple tools simultaneously
- **Streaming Responses**: Real-time output for better UX

## Best Practices Implemented

1. **Dynamic Thinking Allocation**: Simple queries stay fast, complex ones get deep analysis
2. **Smart Caching**: Cache responses and API calls with TTL
3. **Graceful Degradation**: Fallback strategies for errors
4. **Comprehensive Tracing**: Debug every step of agent execution
5. **Modular Architecture**: Clean separation of concerns
6. **Type Safety**: Pydantic models for structured data
7. **Error Recovery**: Retry logic with exponential backoff

## Troubleshooting

### Thinking Mode Issues
- Ensure you're using `gemini-2.5-flash-preview-05-20` or later
- Check thinking budget is within limits (0-24576)
- Verify API key has access to preview models

### Tool Integration
- Built-in tools require explicit enabling in agent config
- Third-party tools need additional API keys (see `.env.example`)
- MCP tools require Node.js for MCP servers

### Performance
- Use caching for repeated queries
- Monitor with OpenTelemetry for bottlenecks
- Adjust thinking budgets based on needs

## Further Reading

- [Gemini 2.5 Flash Announcement](https://blog.google/technology/google-deepmind/gemini-2-5-flash)
- [Google ADK Documentation](https://github.com/google/adk-python)
- [ADK Callback Patterns](https://google.github.io/adk-docs/callbacks/design-patterns-and-best-practices/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Promptfoo Documentation](https://promptfoo.dev)

## Contributing

This example showcases best practices as of 2025. Contributions welcome:
- Additional tool integrations
- Performance optimizations
- New test scenarios
- Documentation improvements

---

Built with ❤️ using Google ADK and Gemini 2.5 Flash
