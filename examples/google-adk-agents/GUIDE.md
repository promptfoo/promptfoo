# Google ADK Agents Guide

This guide walks through the key features demonstrated in this example and how to extend it for your own use cases.

## Architecture Overview

This example showcases a **multi-agent travel planning system** built with Google's Agent Development Kit (ADK):

```
┌─────────────────────────┐
│   Travel Coordinator    │  <-- Main orchestrator
│   (Root Agent)          │
└───────────┬─────────────┘
            │
    ┌───────┴────────┬─────────────┬──────────────┐
    │                │             │              │
┌───▼────┐    ┌─────▼─────┐   ┌──▼──────┐   ┌──▼─────┐
│ Flight │    │   Hotel   │   │Activity │   │ Tools  │
│ Agent  │    │   Agent   │   │  Agent  │   │        │
└────────┘    └───────────┘   └─────────┘   └────────┘
```

## Key ADK Features Demonstrated

### 1. Multi-Agent Systems

The coordinator agent manages three specialized sub-agents:

```python
travel_coordinator = Agent(
    name="travel_coordinator",
    model="gemini-2.0-flash",
    sub_agents=[flight_agent, hotel_agent, activity_agent]
)
```

Each sub-agent has its own:

- **Specialized knowledge domain**
- **Custom tools**
- **Focused instructions**

### 2. Tool Integration

The example demonstrates various tool types:

#### Built-in Tools

```python
from google.adk.tools import google_search
```

#### Custom Function Tools

```python
def search_flights(origin: str, destination: str, departure_date: str) -> dict:
    """Custom tool for flight search"""
    # Implementation
```

#### Tool Composition

Agents can use multiple tools together:

```python
tools=[search_flights, google_search]
```

### 3. Structured Outputs with Pydantic

Using Pydantic models for type-safe, structured data:

```python
class TravelPlan(BaseModel):
    destination: str = Field(description="Travel destination")
    dates: DateRange = Field(description="Travel dates")
    flights: List[Flight] = Field(default_factory=list)
    hotels: List[Hotel] = Field(default_factory=list)
    estimated_total_cost: float
```

### 4. Agent Instructions and Prompting

Each agent has detailed instructions that define its behavior:

```python
instruction="""You are the lead travel planning coordinator.
Your team consists of:
- Flight Agent: Searches and recommends flights
- Hotel Agent: Finds accommodations
- Activity Agent: Plans activities

When a user asks for help:
1. Understand the request
2. Gather initial information
3. Coordinate specialists
4. Compile results
5. Present comprehensive plan"""
```

### 5. Error Handling

The example includes robust error handling:

```python
try:
    result = await travel_coordinator.run(prompt)
    # Process result
except Exception as e:
    return {"error": str(e)}
```

## Extending the Example

### Adding New Agents

1. Create a new agent file in `agents/`:

```python
# agents/restaurant_agent.py
from google.adk.agents import Agent

restaurant_agent = Agent(
    name="restaurant_agent",
    model="gemini-2.0-flash",
    description="Finds and recommends restaurants",
    instruction="...",
    tools=[search_restaurants]
)
```

2. Import and add to coordinator:

```python
from agents.restaurant_agent import restaurant_agent

travel_coordinator = Agent(
    sub_agents=[flight_agent, hotel_agent, activity_agent, restaurant_agent]
)
```

### Adding Custom Tools

1. Create a tool function:

```python
def search_restaurants(city: str, cuisine: str = None, budget: str = None) -> dict:
    """Search for restaurants in a city"""
    # Implementation
    return results
```

2. Add to agent:

```python
tools=[search_restaurants, google_search]
```

### Integrating External APIs

Use ADK's flexibility to integrate any API:

```python
import requests

def real_flight_search(origin: str, destination: str) -> dict:
    """Call real flight API"""
    response = requests.get(
        "https://api.example.com/flights",
        params={"from": origin, "to": destination}
    )
    return response.json()
```

### Adding Memory/State

ADK supports session state for maintaining context:

```python
from google.adk.sessions import Session

# Create session
session = Session()

# Store user preferences
session.state["user_preferences"] = {
    "budget_level": "mid",
    "interests": ["museums", "food"]
}
```

## Best Practices

### 1. Agent Specialization

- Keep agents focused on specific domains
- Use clear, descriptive names
- Document agent capabilities in descriptions

### 2. Tool Design

- Make tools atomic and reusable
- Use clear parameter names and types
- Include comprehensive docstrings
- Handle errors gracefully

### 3. Prompt Engineering

- Be specific in instructions
- Include examples when needed
- Set clear boundaries and constraints
- Guide output format

### 4. Testing

- Test each agent independently
- Test agent coordination
- Include edge cases
- Verify tool integration

## Common Patterns

### Delegation Pattern

The coordinator delegates to specialists based on request type:

```python
if "flight" in user_request:
    use_agent(flight_agent)
elif "hotel" in user_request:
    use_agent(hotel_agent)
```

### Sequential Processing

Process information in logical order:

```python
1. Check destination info
2. Search flights
3. Find hotels near airport
4. Plan activities based on hotel location
```

### Information Aggregation

Combine outputs from multiple agents:

```python
flight_results = flight_agent.run(query)
hotel_results = hotel_agent.run(query)
combined_plan = merge_results(flight_results, hotel_results)
```

## Troubleshooting

### Common Issues

1. **API Key Not Found**
   - Ensure `GOOGLE_API_KEY` is set in `.env`
   - Check file is named `.env` not `.env.example`

2. **Import Errors**
   - Verify all dependencies are installed: `pip install -r requirements.txt`
   - Check Python version (3.9+ required)

3. **Agent Not Responding**
   - Check agent instructions are clear
   - Verify tools are properly configured
   - Review error messages in output

### Debug Tips

1. Enable verbose logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

2. Test tools independently:

```python
result = search_flights("NYC", "LON", "2024-12-25")
print(result)
```

3. Use the test script:

```bash
python test_example.py
```

## Next Steps

1. **Customize for Your Domain**: Adapt the agents for your specific use case
2. **Add Real APIs**: Replace mock data with actual service integrations
3. **Enhance Prompts**: Refine instructions based on testing
4. **Build UI**: Create a web interface using the agent as backend
5. **Deploy**: Use ADK's deployment features for production

## Resources

- [ADK Documentation](https://github.com/google/adk-python)
- [Promptfoo Documentation](https://promptfoo.dev)
- [Google AI Studio](https://aistudio.google.com)

Happy building with ADK! 🚀
