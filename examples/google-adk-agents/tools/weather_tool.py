"""
Weather information tool for travel planning.
"""

import random
from datetime import date
from typing import Dict


def get_weather_forecast(city: str, check_date: date) -> Dict[str, any]:
    """
    Get weather forecast for a city on a specific date.

    This is a mock implementation for demonstration purposes.
    In production, this would call a real weather API.

    Args:
        city: City name
        check_date: Date to check weather for

    Returns:
        Dictionary with weather information
    """

    # Mock weather data based on city and season
    weather_patterns = {
        "tokyo": {
            "spring": {"temp": 18, "conditions": "Cherry blossoms, mild", "rain": 30},
            "summer": {"temp": 28, "conditions": "Hot and humid", "rain": 40},
            "fall": {"temp": 20, "conditions": "Cool and pleasant", "rain": 25},
            "winter": {"temp": 8, "conditions": "Cold and dry", "rain": 15},
        },
        "paris": {
            "spring": {
                "temp": 15,
                "conditions": "Mild with occasional rain",
                "rain": 35,
            },
            "summer": {"temp": 25, "conditions": "Warm and sunny", "rain": 20},
            "fall": {"temp": 12, "conditions": "Cool with autumn colors", "rain": 40},
            "winter": {"temp": 5, "conditions": "Cold and overcast", "rain": 45},
        },
        "new york": {
            "spring": {"temp": 16, "conditions": "Variable weather", "rain": 30},
            "summer": {"temp": 28, "conditions": "Hot and humid", "rain": 35},
            "fall": {"temp": 14, "conditions": "Crisp autumn weather", "rain": 25},
            "winter": {"temp": 2, "conditions": "Cold with possible snow", "rain": 40},
        },
        "london": {
            "spring": {"temp": 12, "conditions": "Cool with showers", "rain": 45},
            "summer": {"temp": 20, "conditions": "Mild and partly cloudy", "rain": 30},
            "fall": {"temp": 10, "conditions": "Rainy and cool", "rain": 50},
            "winter": {"temp": 6, "conditions": "Cold and damp", "rain": 55},
        },
    }

    # Determine season
    month = check_date.month
    if month in [3, 4, 5]:
        season = "spring"
    elif month in [6, 7, 8]:
        season = "summer"
    elif month in [9, 10, 11]:
        season = "fall"
    else:
        season = "winter"

    # Get weather for city or use default
    city_lower = city.lower()
    if city_lower in weather_patterns:
        weather = weather_patterns[city_lower][season]
    else:
        # Default weather with some randomization
        weather = {
            "temp": random.randint(10, 25),
            "conditions": random.choice(
                ["Partly cloudy", "Sunny", "Overcast", "Light rain"]
            ),
            "rain": random.randint(20, 50),
        }

    return {
        "status": "success",
        "city": city,
        "date": check_date.isoformat(),
        "temperature_celsius": weather["temp"],
        "conditions": weather["conditions"],
        "precipitation_chance": weather["rain"],
        "humidity": random.randint(40, 80),
        "recommendations": get_weather_recommendations(
            weather["temp"], weather["rain"]
        ),
    }


def get_weather_recommendations(temp: int, rain_chance: int) -> list:
    """Generate packing recommendations based on weather."""
    recommendations = []

    if temp < 10:
        recommendations.append("Pack warm clothing including jacket and layers")
    elif temp < 20:
        recommendations.append("Pack light jacket or sweater for evenings")
    else:
        recommendations.append("Light clothing suitable, but bring one warm layer")

    if rain_chance > 40:
        recommendations.append("Bring umbrella and waterproof jacket")
    elif rain_chance > 20:
        recommendations.append("Consider packing a light rain jacket")

    if temp > 25:
        recommendations.append("Don't forget sunscreen and sunglasses")

    return recommendations
