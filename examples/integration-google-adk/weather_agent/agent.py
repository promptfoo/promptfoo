#!/usr/bin/env python3
"""
Weather agent built with Google Agent Development Kit (ADK).
Mirrors the structure from official ADK samples and quickstart examples.
"""

from google.adk.agents import Agent


def get_weather(city: str) -> dict[str, str]:
    """
    Mock weather function that returns sample weather data.

    In a real implementation, this would call a weather API like OpenWeatherMap.

    Args:
        city: The city name to get weather for

    Returns:
        Dictionary with status and weather report
    """
    # Mock weather data - matches the official ADK quickstart pattern
    weather_responses = {
        "new york": "The weather in New York is sunny with a temperature of 72°F (22°C). Light breeze from the west.",
        "london": "The weather in London is cloudy with occasional drizzle. Temperature is 58°F (14°C).",
        "paris": "The weather in Paris is partly cloudy with a temperature of 65°F (18°C).",
        "tokyo": "The weather in Tokyo is clear with a temperature of 75°F (24°C). Humidity is moderate.",
        "sydney": "The weather in Sydney is sunny with a temperature of 80°F (27°C). Perfect beach weather!",
        "san francisco": "The weather in San Francisco is foggy with a temperature of 65°F (18°C). Typical marine layer.",
        "chicago": "The weather in Chicago is windy with a temperature of 68°F (20°C). Partly cloudy skies.",
    }

    city_lower = city.lower().strip()

    # Check for exact matches first
    if city_lower in weather_responses:
        return {"status": "success", "report": weather_responses[city_lower]}

    # Check for partial matches
    for known_city, response in weather_responses.items():
        if known_city in city_lower or city_lower in known_city:
            return {"status": "success", "report": response}

    # Default response for unknown cities
    return {
        "status": "success",
        "report": f"I don't have current weather data for {city}, but you can check a weather service like weather.com or weather.gov for accurate information.",
    }


# Create the agent following the official ADK pattern
root_agent = Agent(
    name="weather_agent",
    model="gemini-2.5-flash",  # Using Gemini 2.5 Flash - Google's latest model
    description="Agent to answer questions about weather in various cities",
    instruction="""You are a helpful weather assistant with memory of our conversation. You can provide weather information for cities around the world.

When users ask about weather, use the get_weather function to get current conditions. Remember the cities you've discussed in our conversation so you can reference them later.

If users ask about what cities we've discussed, recall and mention the specific cities from our conversation history.

Always be friendly and helpful in your responses. If the weather data isn't available for a specific city, suggest alternative ways for users to get current weather information.""",
    tools=[get_weather],
)


# Test function for development
if __name__ == "__main__":
    print("Testing ADK weather agent...")

    # Test the weather function directly
    test_cities = ["New York", "London", "Unknown City"]
    for city in test_cities:
        result = get_weather(city)
        print(f"Weather for {city}: {result}")

    print(f"\nAgent configuration:")
    print(f"Name: {root_agent.name}")
    print(f"Model: {root_agent.model}")
    print(f"Description: {root_agent.description}")
    print("✅ Weather agent configured successfully!")
