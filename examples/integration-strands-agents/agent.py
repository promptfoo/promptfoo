"""Strands agent implementation with weather tools.

This module demonstrates how to build a Strands agent with custom tools
that can be evaluated by promptfoo. It showcases:

- The @tool decorator for defining agent capabilities
  https://strandsagents.com/latest/user-guide/concepts/tools/python-tools/
- Multiple tools working together (weather lookup + temperature conversion)
- Integration with OpenAI models via Strands SDK
  https://strandsagents.com/latest/user-guide/concepts/model-providers/openai/

Strands Agents SDK is an open-source AI agent framework by AWS:
- Documentation: https://strandsagents.com/
- GitHub: https://github.com/strands-agents/sdk-python
- PyPI: https://pypi.org/project/strands-agents/
"""

from strands import Agent, tool
from strands.models.openai import OpenAIModel

# Define tools using the @tool decorator. The docstring becomes the tool's
# description that the LLM uses to decide when to call it.


@tool
def get_weather(city: str) -> str:
    """Get current weather for a city.

    Args:
        city: The name of the city to get weather for
    """
    weather_data = {
        "new york": "72°F, Sunny",
        "london": "58°F, Cloudy",
        "tokyo": "68°F, Clear",
        "paris": "64°F, Partly Cloudy",
        "seattle": "55°F, Rainy",
        "san francisco": "62°F, Foggy",
    }
    city_lower = city.lower()
    if city_lower in weather_data:
        return f"Weather in {city}: {weather_data[city_lower]}"
    return f"Weather in {city}: 70°F, Clear (default)"


@tool
def convert_temperature(value: float, from_unit: str) -> str:
    """Convert temperature between Fahrenheit and Celsius.

    Args:
        value: The temperature value to convert
        from_unit: The unit to convert from ('F' for Fahrenheit, 'C' for Celsius)
    """
    from_unit = from_unit.upper()
    if from_unit == "F":
        celsius = (value - 32) * 5 / 9
        return f"{value}°F = {celsius:.1f}°C"
    elif from_unit == "C":
        fahrenheit = (value * 9 / 5) + 32
        return f"{value}°C = {fahrenheit:.1f}°F"
    return f"Unknown unit '{from_unit}'. Use 'F' for Fahrenheit or 'C' for Celsius."


def create_agent(model_id: str = "gpt-4o-mini") -> Agent:
    """Create a Strands agent with weather tools.

    Args:
        model_id: The OpenAI model ID to use

    Returns:
        A configured Strands Agent instance
    """
    model = OpenAIModel(model_id=model_id, params={"temperature": 0.7})
    return Agent(
        model=model,
        tools=[get_weather, convert_temperature],
        system_prompt=(
            "You are a helpful weather assistant. "
            "Use the weather tool to get weather for cities and the temperature "
            "conversion tool to convert between Fahrenheit and Celsius."
        ),
    )


def run_agent(prompt: str, model_id: str = "gpt-4o-mini") -> str:
    """Run the agent with a prompt and return the response.

    Args:
        prompt: The user's input message
        model_id: The OpenAI model ID to use

    Returns:
        The agent's response as a string
    """
    import io
    import sys

    agent = create_agent(model_id)

    # Suppress stdout during agent execution. The Strands SDK prints tool call
    # information to stdout (e.g., "Tool #1: get_weather"), which interferes with
    # promptfoo's Python worker protocol that uses stdout for control messages.
    # Without this suppression, the worker times out waiting for protocol signals.
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        result = agent(prompt)
    finally:
        sys.stdout = old_stdout

    return str(result)


if __name__ == "__main__":
    import os

    if os.getenv("OPENAI_API_KEY"):
        print("Testing Strands agent...")
        response = run_agent("What's the weather in New York?")
        print(f"Response: {response}")
    else:
        print("Set OPENAI_API_KEY to test.")
