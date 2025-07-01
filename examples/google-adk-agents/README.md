# Google ADK Agents Example

This example demonstrates how to evaluate [Google's Agent Development Kit (ADK)](https://github.com/google/adk-python) agents using promptfoo. ADK is Google's open-source Python framework for building, evaluating, and deploying sophisticated AI agents with flexibility and control.

## Quick Start

Run this example with:

```bash
npx promptfoo@latest init --example google-adk-agents
```

## Setup

```bash
cd google-adk-agents

# Install Python dependencies (required!)
pip install -r requirements.txt

# Set environment variables
export GOOGLE_API_KEY=your_google_ai_studio_api_key_here
export GOOGLE_GENAI_USE_VERTEXAI=FALSE

# Run evaluation
npx promptfoo@latest eval

# View results
npx promptfoo@latest view
```

**Note**: Make sure to install the Python dependencies (`pip install -r requirements.txt`) before running the evaluation, as this example requires the `google-adk` package.

## What This Shows

This example demonstrates a multi-agent travel planning system with:

- **Multi-Agent Architecture**: A coordinator agent that delegates to specialized agents
- **Built-in Tools**: Google Search integration for real-time information
- **Custom Tools**: Weather API and destination information tools
- **Structured Outputs**: Using Pydantic models for type-safe responses
- **Memory & State**: Maintaining context across agent interactions
- **Complex Workflows**: Combining multiple agents to solve sophisticated tasks

## Architecture

The system consists of four specialized agents:

1. **Travel Coordinator** (root agent): Orchestrates the planning process
2. **Flight Agent**: Handles flight searches and recommendations
3. **Hotel Agent**: Finds and recommends accommodations
4. **Activity Agent**: Suggests activities and creates itineraries

Each agent has specific tools and responsibilities, working together to create comprehensive travel plans.

## Example Usage

Ask the coordinator to:

- "Plan a 3-day trip to Tokyo for next month"
- "Find flights from NYC to London in December"
- "Suggest family-friendly hotels in Paris under $200/night"
- "Create an itinerary for a weekend in San Francisco"

## Files

- `agents/`: Contains all agent implementations
  - `coordinator.py`: Main orchestrator agent
  - `flight_agent.py`: Flight search specialist
  - `hotel_agent.py`: Accommodation specialist
  - `activity_agent.py`: Activities and itinerary planner
- `tools/`: Custom tool implementations
  - `weather_tool.py`: Weather information tool
  - `destination_tool.py`: Destination facts and tips
- `models.py`: Pydantic models for structured outputs
- `provider.py`: Promptfoo provider that runs the ADK agents
- `promptfooconfig.yaml`: Evaluation configuration
- `requirements.txt`: Python dependencies

## Key Features Demonstrated

### Multi-Agent Coordination

```python
# Coordinator delegates to specialized agents
sub_agents=[flight_agent, hotel_agent, activity_agent]
```

### Tool Integration

- Built-in Google Search for real-time data
- Custom weather and destination tools
- Function tools with proper error handling

### Structured Outputs

```python
class TravelPlan(BaseModel):
    destination: str
    dates: DateRange
    flights: List[Flight]
    hotels: List[Hotel]
    activities: List[Activity]
    total_budget: float
```

### Comprehensive Testing

- Multiple assertion types (JSON schema, Python, LLM rubric)
- Edge case handling
- Multi-turn conversations
- Error scenarios

## Running Tests

The evaluation tests various scenarios:

- Basic trip planning requests
- Budget constraints
- Date availability
- Multi-city trips
- Error handling

## Troubleshooting

If you encounter `ModuleNotFoundError: No module named 'google.adk'`:
1. Make sure you're in the example directory: `cd google-adk-agents`
2. Install the requirements: `pip install -r requirements.txt`
3. Consider using a virtual environment to avoid conflicts
