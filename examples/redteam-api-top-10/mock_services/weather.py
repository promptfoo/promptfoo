"""
Mock Weather Service

Provides weather data for user locations to enable product recommendations.
"""

from datetime import datetime

# Mock weather data by city
WEATHER_DATA = {
    "san francisco, ca": {
        "city": "San Francisco",
        "state": "CA",
        "temperature_f": 58,
        "condition": "Foggy",
        "humidity": 78,
        "wind_mph": 12,
        "feels_like_f": 54,
        "forecast": "Typical foggy morning, clearing to partly cloudy by afternoon",
        "weather_tags": ["cold", "mild"],
        "recommendations": [
            "Perfect hoodie weather! Check out our CloudCo Zip Hoodie.",
            "A warm coffee mug would be great for foggy mornings.",
        ],
    },
    "new york, ny": {
        "city": "New York",
        "state": "NY",
        "temperature_f": 35,
        "condition": "Cold & Clear",
        "humidity": 45,
        "wind_mph": 18,
        "feels_like_f": 28,
        "forecast": "Clear but cold with strong winds. Bundle up!",
        "weather_tags": ["cold", "outdoor"],
        "recommendations": [
            "Definitely beanie weather! Our CloudCo Beanie will keep you warm.",
            "Layer up with a hoodie under your coat.",
        ],
    },
    "chicago, il": {
        "city": "Chicago",
        "state": "IL",
        "temperature_f": 28,
        "condition": "Snow Flurries",
        "humidity": 65,
        "wind_mph": 25,
        "feels_like_f": 15,
        "forecast": "Light snow with gusty winds. The Windy City living up to its name!",
        "weather_tags": ["cold", "outdoor"],
        "recommendations": [
            "Bundle up! Our warmest hoodie is the CloudCo Zip Hoodie.",
            "Don't forget a beanie - you'll need it in that wind!",
            "Hot coffee in a CloudCo mug is essential today.",
        ],
    },
    "austin, tx": {
        "city": "Austin",
        "state": "TX",
        "temperature_f": 72,
        "condition": "Sunny",
        "humidity": 55,
        "wind_mph": 8,
        "feels_like_f": 72,
        "forecast": "Beautiful day ahead! Sunny with light breeze.",
        "weather_tags": ["mild", "sunny", "outdoor"],
        "recommendations": [
            "Perfect t-shirt weather! Check out our CloudCo Logo Tee.",
            "Don't forget your snapback for the sun!",
            "Stay hydrated with our insulated water bottle.",
        ],
    },
    "seattle, wa": {
        "city": "Seattle",
        "state": "WA",
        "temperature_f": 48,
        "condition": "Rainy",
        "humidity": 85,
        "wind_mph": 10,
        "feels_like_f": 44,
        "forecast": "Classic Seattle weather - overcast with steady rain.",
        "weather_tags": ["cold", "indoor"],
        "recommendations": [
            "Hoodie weather for sure! Stay warm and dry.",
            "A travel tumbler keeps your coffee warm between rain sprints.",
            "Work from home? Our desk pad makes rainy days cozier.",
        ],
    },
    # Default for unknown locations
    "default": {
        "city": "Unknown",
        "state": "NA",
        "temperature_f": 65,
        "condition": "Partly Cloudy",
        "humidity": 50,
        "wind_mph": 10,
        "feels_like_f": 65,
        "forecast": "Moderate conditions expected.",
        "weather_tags": ["mild"],
        "recommendations": [
            "A classic CloudCo Logo Tee works in any weather!",
            "Can't go wrong with our versatile Travel Tumbler.",
        ],
    },
}


def normalize_location(location: str) -> str:
    """Normalize location string for lookup."""
    return location.lower().strip()


def get_weather(location: str) -> dict:
    """
    Get current weather and product recommendations for a location.

    Args:
        location: City name or "City, State" format

    Returns:
        Weather data with product recommendations
    """
    normalized = normalize_location(location)

    # Try exact match first
    if normalized in WEATHER_DATA:
        data = WEATHER_DATA[normalized]
    else:
        # Try partial match
        matched = None
        for key in WEATHER_DATA.keys():
            if key != "default":
                city_name = key.split(",")[0]
                if city_name in normalized or normalized in city_name:
                    matched = key
                    break

        if matched:
            data = WEATHER_DATA[matched]
        else:
            data = WEATHER_DATA["default"]
            data = {
                **data,
                "city": location,
                "note": "Weather data approximated for unknown location",
            }

    now = datetime.now()

    return {
        "location": f"{data['city']}, {data['state']}",
        "temperature": data["temperature_f"],
        "temperature_unit": "F",
        "feels_like": data["feels_like_f"],
        "condition": data["condition"],
        "humidity": data["humidity"],
        "humidity_unit": "%",
        "wind": data["wind_mph"],
        "wind_unit": "mph",
        "forecast": data["forecast"],
        "weather_tags": data["weather_tags"],
        "product_recommendations": data["recommendations"],
        "updated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
    }


def get_weather_recommendations(location: str) -> dict:
    """
    Get just the product recommendations for a location.

    Args:
        location: City name or "City, State" format

    Returns:
        Product recommendations based on weather
    """
    weather = get_weather(location)

    return {
        "location": weather["location"],
        "condition": weather["condition"],
        "temperature": weather["temperature"],
        "recommendations": weather["product_recommendations"],
        "suggested_categories": get_categories_for_weather(weather["weather_tags"]),
    }


def get_categories_for_weather(tags: list) -> list:
    """Map weather tags to product categories."""
    category_map = {
        "cold": ["hoodies", "beanies", "mugs"],
        "hot": ["water bottles", "t-shirts"],
        "sunny": ["snapbacks", "water bottles"],
        "mild": ["t-shirts", "accessories"],
        "indoor": ["mugs", "mousepad", "stickers"],
        "outdoor": ["backpack", "water bottles", "snapbacks"],
    }

    categories = set()
    for tag in tags:
        if tag in category_map:
            categories.update(category_map[tag])

    return list(categories)
