"""
Weather assistant agent using PydanticAI.

This agent can answer weather questions by:
1. Converting location names to coordinates (geocoding)
2. Fetching weather data for those coordinates
3. Returning structured, typed responses
"""

from typing import Optional
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
import httpx
import os


class WeatherResponse(BaseModel):
    """Structured weather response"""
    location: str
    temperature: str
    description: str
    humidity: Optional[str] = None
    wind_speed: Optional[str] = None
    error: Optional[str] = None


class Deps(BaseModel):
    """Dependencies for the weather agent"""
    model_config = {'arbitrary_types_allowed': True}
    
    client: httpx.AsyncClient
    weather_api_key: Optional[str] = None
    geo_api_key: Optional[str] = None


# Weather agent will be created lazily when needed
_weather_agent = None

def get_weather_agent(model: str = 'openai:gpt-4o-mini') -> Agent:
    """Get or create the weather agent with the specified model"""
    global _weather_agent
    
    # Create agent with the specified model
    agent = Agent(
        model,
        deps_type=Deps,
        output_type=WeatherResponse,
        system_prompt=(
            'You are a helpful weather assistant. '
            'Use the geocoding tool to get coordinates for locations, '
            'then use the weather tool to get current conditions. '
            'Always provide clear, accurate weather information.'
        ),
    )
    
    # Add the tools to this agent
    agent.tool(get_coordinates)
    agent.tool(get_weather)
    
    return agent


async def get_coordinates(ctx: RunContext[Deps], location: str) -> dict[str, float]:
    """Get latitude and longitude for a location.
    
    Args:
        ctx: The context containing dependencies
        location: Location name (e.g., "New York", "London, UK")
    
    Returns:
        Dictionary with 'lat' and 'lng' keys
    """
    if ctx.deps.geo_api_key is None:
        # Return mock coordinates for demo purposes
        mock_coords = {
            "london": {"lat": 51.5074, "lng": -0.1278},
            "new york": {"lat": 40.7128, "lng": -74.0060},
            "tokyo": {"lat": 35.6762, "lng": 139.6503},
            "paris": {"lat": 48.8566, "lng": 2.3522},
            "sydney": {"lat": -33.8688, "lng": 151.2093},
        }
        
        location_lower = location.lower()
        for city, coords in mock_coords.items():
            if city in location_lower:
                return coords
        
        # Default to London if location not found
        return {"lat": 51.5074, "lng": -0.1278}
    
    # Real geocoding implementation (requires API key)
    params = {'access_token': ctx.deps.geo_api_key}
    url = f'https://api.mapbox.com/geocoding/v5/mapbox.places/{location}.json'
    
    try:
        response = await ctx.deps.client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        if features := data.get('features'):
            lng, lat = features[0]['center']
            return {'lat': lat, 'lng': lng}
        else:
            raise ValueError(f'Location not found: {location}')
    except Exception as e:
        raise ValueError(f'Geocoding failed: {str(e)}')


async def get_weather(ctx: RunContext[Deps], lat: float, lng: float, location_name: str) -> dict:
    """Get current weather for coordinates.
    
    Args:
        ctx: The context containing dependencies
        lat: Latitude
        lng: Longitude  
        location_name: Human-readable location name
        
    Returns:
        Dictionary with weather information
    """
    if ctx.deps.weather_api_key is None:
        # Return mock weather data for demo purposes
        import random
        
        conditions = [
            {"temp": "22°C", "desc": "Sunny", "humidity": "45%", "wind": "10 km/h"},
            {"temp": "18°C", "desc": "Partly Cloudy", "humidity": "60%", "wind": "15 km/h"},
            {"temp": "12°C", "desc": "Rainy", "humidity": "85%", "wind": "20 km/h"},
            {"temp": "25°C", "desc": "Clear", "humidity": "40%", "wind": "8 km/h"},
        ]
        
        weather = random.choice(conditions)
        return {
            'location': location_name,
            'temperature': weather['temp'],
            'description': weather['desc'],
            'humidity': weather['humidity'],
            'wind_speed': weather['wind']
        }
    
    # Real weather API implementation (requires API key)
    params = {
        'apikey': ctx.deps.weather_api_key,
        'location': f'{lat},{lng}',
        'units': 'metric',
    }
    
    try:
        response = await ctx.deps.client.get(
            'https://api.tomorrow.io/v4/weather/realtime',
            params=params
        )
        response.raise_for_status()
        data = response.json()
        
        values = data['data']['values']
        
        # Weather code lookup
        code_lookup = {
            1000: 'Clear, Sunny',
            1100: 'Mostly Clear',
            1101: 'Partly Cloudy',
            1102: 'Mostly Cloudy',
            1001: 'Cloudy',
            2000: 'Fog',
            4000: 'Drizzle',
            4001: 'Rain',
            5000: 'Snow',
            8000: 'Thunderstorm',
        }
        
        return {
            'location': location_name,
            'temperature': f'{values["temperatureApparent"]:.0f}°C',
            'description': code_lookup.get(values['weatherCode'], 'Unknown'),
            'humidity': f'{values.get("humidity", 0):.0f}%',
            'wind_speed': f'{values.get("windSpeed", 0):.0f} km/h'
        }
    except Exception as e:
        raise ValueError(f'Weather API failed: {str(e)}')


async def run_weather_agent(query: str, model: str = 'openai:gpt-4o-mini') -> WeatherResponse:
    """Run the weather agent with a query.
    
    Args:
        query: User's weather question
        model: LLM model to use
        
    Returns:
        WeatherResponse with structured weather data
    """
    async with httpx.AsyncClient() as client:
        deps = Deps(
            client=client,
            weather_api_key=os.getenv('WEATHER_API_KEY'),
            geo_api_key=os.getenv('GEO_API_KEY')
        )
        
        try:
            # Get the weather agent with the specified model
            agent = get_weather_agent(model)
            result = await agent.run(query, deps=deps)
            return result.output
        except Exception as e:
            return WeatherResponse(
                location="Unknown",
                temperature="N/A",
                description="Error occurred",
                error=str(e)
            )


if __name__ == "__main__":
    import asyncio
    
    async def test_agent():
        """Test the weather agent"""
        queries = [
            "What's the weather like in London?",
            "How's the weather in New York today?",
            "Tell me about the current conditions in Tokyo"
        ]
        
        for query in queries:
            print(f"\nQuery: {query}")
            result = await run_weather_agent(query)
            print(f"Response: {result.model_dump_json(indent=2)}")
    
    asyncio.run(test_agent()) 