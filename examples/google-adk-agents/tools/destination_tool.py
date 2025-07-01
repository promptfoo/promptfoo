"""
Destination information tool for travel planning.
"""

from typing import Dict

DESTINATION_DATA = {
    "tokyo": {
        "country": "Japan",
        "currency": "Japanese Yen (JPY)",
        "language": "Japanese",
        "timezone": "JST (UTC+9)",
        "visa_requirements": "Visa-free for many countries for stays up to 90 days",
        "best_time_to_visit": "Spring (March-May) for cherry blossoms, Fall (September-November) for autumn colors",
        "must_see_attractions": [
            "Senso-ji Temple",
            "Tokyo Skytree",
            "Meiji Shrine",
            "Shibuya Crossing",
            "Tsukiji Outer Market",
        ],
        "local_tips": [
            "Learn basic Japanese phrases - locals appreciate the effort",
            "Remove shoes when entering homes, some restaurants, and temples",
            "Tipping is not customary and can be considered rude",
            "Get a JR Pass for convenient train travel",
            "Try convenience store food - it's surprisingly good!",
        ],
        "transportation": "Excellent public transport via JR lines and Tokyo Metro",
        "avg_daily_budget": {"budget": 80, "mid": 150, "luxury": 300},
    },
    "paris": {
        "country": "France",
        "currency": "Euro (EUR)",
        "language": "French",
        "timezone": "CET (UTC+1)",
        "visa_requirements": "Schengen visa required for some nationalities",
        "best_time_to_visit": "April-June and September-October for pleasant weather",
        "must_see_attractions": [
            "Eiffel Tower",
            "Louvre Museum",
            "Notre-Dame Cathedral",
            "Arc de Triomphe",
            "Versailles Palace",
        ],
        "local_tips": [
            "Always greet with 'Bonjour' before asking for help",
            "Many museums are free on the first Sunday of each month",
            "Avoid tourist trap restaurants near major attractions",
            "Get a Paris Museum Pass for skip-the-line access",
            "Bakeries (boulangeries) have the best croissants in the morning",
        ],
        "transportation": "Metro is efficient and covers most areas",
        "avg_daily_budget": {"budget": 100, "mid": 200, "luxury": 400},
    },
    "new york": {
        "country": "United States",
        "currency": "US Dollar (USD)",
        "language": "English",
        "timezone": "EST (UTC-5)",
        "visa_requirements": "ESTA required for visa waiver countries",
        "best_time_to_visit": "Fall (September-November) and Spring (April-June)",
        "must_see_attractions": [
            "Statue of Liberty",
            "Central Park",
            "Times Square",
            "Brooklyn Bridge",
            "Metropolitan Museum of Art",
        ],
        "local_tips": [
            "Walk fast or move to the side on sidewalks",
            "Subway is the fastest way to get around",
            "Many attractions require advance booking",
            "Pizza by the slice is a NYC staple",
            "Broadway shows often have same-day discount tickets",
        ],
        "transportation": "Subway system covers all boroughs",
        "avg_daily_budget": {"budget": 120, "mid": 250, "luxury": 500},
    },
    "london": {
        "country": "United Kingdom",
        "currency": "British Pound (GBP)",
        "language": "English",
        "timezone": "GMT (UTC+0)",
        "visa_requirements": "Visa-free for many countries for up to 6 months",
        "best_time_to_visit": "May-September for warmer weather",
        "must_see_attractions": [
            "Big Ben & Parliament",
            "Tower of London",
            "British Museum",
            "Buckingham Palace",
            "London Eye",
        ],
        "local_tips": [
            "Stand right on escalators in the Underground",
            "Many museums are free entry",
            "Get an Oyster Card for public transport",
            "Pubs close early (11 PM)",
            "Mind the gap on the Tube!",
        ],
        "transportation": "Extensive Underground (Tube) and bus network",
        "avg_daily_budget": {"budget": 90, "mid": 180, "luxury": 350},
    },
}


def get_destination_info(city: str) -> Dict[str, any]:
    """
    Get comprehensive information about a travel destination.

    Args:
        city: City name

    Returns:
        Dictionary with destination information
    """
    city_lower = city.lower()

    if city_lower in DESTINATION_DATA:
        data = DESTINATION_DATA[city_lower]
        return {
            "status": "success",
            "city": city,
            "country": data["country"],
            "currency": data["currency"],
            "language": data["language"],
            "timezone": data["timezone"],
            "visa_requirements": data["visa_requirements"],
            "best_time_to_visit": data["best_time_to_visit"],
            "must_see_attractions": data["must_see_attractions"],
            "local_tips": data["local_tips"],
            "transportation": data["transportation"],
            "average_daily_budget": data["avg_daily_budget"],
        }
    else:
        return {
            "status": "limited_info",
            "city": city,
            "message": f"Limited information available for {city}. Consider researching visa requirements, local customs, and transportation options.",
            "general_tips": [
                "Research visa requirements for your nationality",
                "Check if you need any vaccinations",
                "Learn basic phrases in the local language",
                "Research local customs and etiquette",
                "Check the best time to visit for weather",
            ],
        }


def get_budget_estimate(
    city: str, days: int, budget_level: str = "mid"
) -> Dict[str, any]:
    """
    Estimate travel budget for a destination.

    Args:
        city: City name
        days: Number of days
        budget_level: "budget", "mid", or "luxury"

    Returns:
        Budget breakdown
    """
    city_lower = city.lower()

    if city_lower in DESTINATION_DATA:
        daily_budget = DESTINATION_DATA[city_lower]["avg_daily_budget"].get(
            budget_level, 150
        )
    else:
        # Default estimates
        daily_budget = {"budget": 100, "mid": 200, "luxury": 400}.get(budget_level, 200)

    accommodation = daily_budget * 0.4
    food = daily_budget * 0.3
    activities = daily_budget * 0.2
    transport = daily_budget * 0.1

    return {
        "city": city,
        "days": days,
        "budget_level": budget_level,
        "daily_budget": daily_budget,
        "total_estimate": daily_budget * days,
        "breakdown": {
            "accommodation_per_day": accommodation,
            "food_per_day": food,
            "activities_per_day": activities,
            "local_transport_per_day": transport,
            "total_accommodation": accommodation * days,
            "total_food": food * days,
            "total_activities": activities * days,
            "total_transport": transport * days,
        },
        "tips": [
            "Book accommodation in advance for better rates",
            "Consider apartment rentals for longer stays",
            "Eat where locals eat for authentic and affordable meals",
            "Many cities offer tourist passes for attractions and transport",
        ],
    }
