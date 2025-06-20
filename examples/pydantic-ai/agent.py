"""
Simple weather assistant agent using PydanticAI.

This agent demonstrates structured outputs by returning weather information
in a consistent format using Pydantic models.
"""

from pydantic import BaseModel
from pydantic_ai import Agent

class WeatherResponse(BaseModel):
    """Structured weather response"""
    location: str
    temperature: str
    description: str

def get_weather_agent(model: str = 'openai:gpt-4o-mini') -> Agent:
    """Create a weather agent with structured output"""
    agent = Agent(
        model,
        output_type=WeatherResponse,
        system_prompt=(
            'You are a helpful weather assistant. '
            'Use the get_weather tool to fetch weather data for locations. '
            'Always return responses in the required structured format.'
        ),
    )
    
    agent.tool(get_weather)
    return agent

@agent.tool
def get_weather(location: str) -> dict:
    """Get weather data for a location (mock implementation for demo)"""
    # Simple mock weather data for demonstration
    mock_weather = {
        "london": {"temp": "18°C", "desc": "Cloudy"},
        "new york": {"temp": "22°C", "desc": "Sunny"},
        "tokyo": {"temp": "16°C", "desc": "Rainy"},
        "paris": {"temp": "20°C", "desc": "Partly Cloudy"},
    }
    
    location_lower = location.lower()
    for city, weather in mock_weather.items():
        if city in location_lower:
            return {
                'location': location,
                'temperature': weather['temp'],
                'description': weather['desc']
            }
    
    # Default response for unknown locations
    return {
        'location': location,
        'temperature': '21°C',
        'description': 'Clear'
    }

async def run_weather_agent(query: str, model: str = 'openai:gpt-4o-mini') -> WeatherResponse:
    """Run the weather agent with a query"""
    try:
        agent = get_weather_agent(model)
        result = await agent.run(query)
        return result.output
    except Exception as e:
        return WeatherResponse(
            location="Unknown",
            temperature="N/A",
            description=f"Error: {str(e)}"
        )

if __name__ == "__main__":
    import asyncio

    async def test_agent():
        """Test the weather agent"""
        queries = [
            "What's the weather like in London?",
            "How's the weather in New York?",
        ]

        for query in queries:
            print(f"\nQuery: {query}")
            result = await run_weather_agent(query)
            print(f"Response: {result.model_dump_json(indent=2)}")

    asyncio.run(test_agent())