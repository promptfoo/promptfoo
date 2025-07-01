"""
Hotel search specialist agent using Google ADK.
"""

from datetime import datetime
from google.adk.agents import Agent
from google.adk.tools import google_search
from models import Hotel
import random


def search_hotels(
    city: str,
    check_in_date: str,
    check_out_date: str,
    budget_per_night: float = None,
    num_guests: int = 1,
) -> dict:
    """
    Search for hotels in a city.

    Args:
        city: City name
        check_in_date: Check-in date (YYYY-MM-DD)
        check_out_date: Check-out date (YYYY-MM-DD)
        budget_per_night: Optional maximum price per night
        num_guests: Number of guests

    Returns:
        Dictionary with hotel options
    """
    try:
        # Parse dates to validate
        check_in = datetime.strptime(check_in_date, "%Y-%m-%d")
        check_out = datetime.strptime(check_out_date, "%Y-%m-%d")
        nights = (check_out - check_in).days

        if nights <= 0:
            return {
                "status": "error",
                "message": "Check-out date must be after check-in date",
            }

        # Generate mock hotels
        hotel_data = [
            {
                "name": f"Grand {city.title()} Hotel",
                "rating": 4.8,
                "price": 250,
                "amenities": ["WiFi", "Pool", "Spa", "Restaurant", "Gym"],
                "distance": "0.5 miles from city center",
            },
            {
                "name": f"{city.title()} Plaza Inn",
                "rating": 4.5,
                "price": 180,
                "amenities": ["WiFi", "Restaurant", "Business Center", "Bar"],
                "distance": "1.2 miles from city center",
            },
            {
                "name": f"Budget Stay {city.title()}",
                "rating": 4.2,
                "price": 95,
                "amenities": ["WiFi", "Breakfast", "24-hour Front Desk"],
                "distance": "2.0 miles from city center",
            },
            {
                "name": f"Boutique {city.title()}",
                "rating": 4.6,
                "price": 195,
                "amenities": ["WiFi", "Restaurant", "Rooftop Bar", "Concierge"],
                "distance": "0.8 miles from city center",
            },
            {
                "name": f"{city.title()} Hostel & Suites",
                "rating": 4.0,
                "price": 65,
                "amenities": ["WiFi", "Shared Kitchen", "Laundry", "Lockers"],
                "distance": "1.5 miles from city center",
            },
        ]

        # Filter by budget if specified
        if budget_per_night:
            hotel_data = [h for h in hotel_data if h["price"] <= budget_per_night]

        # Create Hotel objects
        hotels = []
        for data in hotel_data:
            # Add some price variation
            price = data["price"] * (0.9 + random.random() * 0.2)

            hotel = Hotel(
                name=data["name"],
                address=f"{random.randint(100, 999)} {city.title()} Street",
                rating=data["rating"],
                price_per_night=round(price, 2),
                amenities=data["amenities"],
                distance_to_center=data["distance"],
                available=random.random() > 0.1,  # 90% availability
            )
            hotels.append(hotel)

        # Sort by rating
        hotels.sort(key=lambda x: x.rating, reverse=True)

        return {
            "status": "success",
            "search_criteria": {
                "city": city,
                "check_in": check_in_date,
                "check_out": check_out_date,
                "nights": nights,
                "guests": num_guests,
                "budget_per_night": budget_per_night,
            },
            "hotels": [hotel.model_dump() for hotel in hotels],
            "total_results": len(hotels),
            "price_range": {
                "min": min(h.price_per_night for h in hotels) if hotels else 0,
                "max": max(h.price_per_night for h in hotels) if hotels else 0,
                "currency": "USD",
            },
        }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": "Unable to search hotels. Please check your input.",
        }


def filter_hotels_by_amenities(hotels: list, required_amenities: list) -> list:
    """Filter hotels by required amenities."""
    filtered = []
    for hotel in hotels:
        if all(amenity in hotel.get("amenities", []) for amenity in required_amenities):
            filtered.append(hotel)
    return filtered


# Create the hotel agent
hotel_agent = Agent(
    name="hotel_agent",
    model="gemini-2.5-flash-preview-04-17",
    description="A specialized agent for finding and recommending hotels.",
    instruction="""You are a hotel accommodation specialist. Your role is to help users find the perfect place to stay for their trips.

When searching for hotels:
1. Use the search_hotels tool to find available options
2. Consider the user's budget, preferences, and needs
3. Use Google Search for additional information about specific hotels or areas
4. Provide balanced recommendations considering price, location, and amenities

Key responsibilities:
- Find hotels that match the user's criteria (dates, budget, location)
- Compare different accommodation types (hotels, hostels, boutique)
- Highlight important amenities and features
- Advise on neighborhoods and proximity to attractions
- Note any special considerations (family-friendly, business travel, etc.)

Always present hotel options clearly with:
- Name and rating
- Price per night and total cost
- Key amenities
- Location relative to city center or attractions
- Availability status
- Pros and cons of each option

If the user has specific needs (e.g., gym, pool, pet-friendly), prioritize hotels that meet these requirements.""",
    tools=[search_hotels, google_search],
)
