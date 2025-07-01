"""
Activity planning specialist agent using Google ADK.
"""

from datetime import datetime, timedelta
from google.adk.agents import Agent
from google.adk.tools import google_search
from models import Activity, DayItinerary
from tools.destination_tool import get_destination_info


def search_activities(
    city: str, interests: list = None, duration_days: int = 1
) -> dict:
    """
    Search for activities and attractions in a city.

    Args:
        city: City name
        interests: List of interests (e.g., ["museums", "food", "adventure"])
        duration_days: Number of days to plan activities for

    Returns:
        Dictionary with activity options
    """
    # Get destination info for must-see attractions
    dest_info = get_destination_info(city)

    # Define activity categories and examples
    activity_templates = {
        "sightseeing": [
            {
                "name": "City Walking Tour",
                "duration": 3,
                "price": 25,
                "time": "morning",
            },
            {"name": "Hop-on Hop-off Bus", "duration": 4, "price": 45, "time": "any"},
            {
                "name": "Photography Tour",
                "duration": 2.5,
                "price": 60,
                "time": "morning",
            },
        ],
        "museums": [
            {"name": "Art Museum Visit", "duration": 3, "price": 20, "time": "any"},
            {"name": "History Museum", "duration": 2, "price": 15, "time": "afternoon"},
            {"name": "Science Center", "duration": 3.5, "price": 25, "time": "any"},
        ],
        "food": [
            {
                "name": "Food Market Tour",
                "duration": 2.5,
                "price": 55,
                "time": "morning",
            },
            {"name": "Cooking Class", "duration": 3, "price": 85, "time": "afternoon"},
            {"name": "Wine Tasting", "duration": 2, "price": 65, "time": "evening"},
        ],
        "adventure": [
            {"name": "Bike Tour", "duration": 3, "price": 40, "time": "morning"},
            {
                "name": "Kayaking Experience",
                "duration": 2.5,
                "price": 75,
                "time": "afternoon",
            },
            {"name": "Hiking Excursion", "duration": 4, "price": 50, "time": "morning"},
        ],
        "cultural": [
            {"name": "Traditional Show", "duration": 2, "price": 45, "time": "evening"},
            {
                "name": "Temple/Church Visit",
                "duration": 1.5,
                "price": 10,
                "time": "morning",
            },
            {
                "name": "Local Workshop",
                "duration": 2.5,
                "price": 70,
                "time": "afternoon",
            },
        ],
    }

    # Create activities based on interests or default selection
    activities = []

    # Add must-see attractions from destination info
    if dest_info.get("status") == "success":
        for i, attraction in enumerate(dest_info.get("must_see_attractions", [])[:3]):
            activity = Activity(
                name=attraction,
                description=f"Visit one of {city}'s most famous attractions",
                duration_hours=2.5,
                price_per_person=20 + (i * 5),
                category="must-see",
                recommended_time="any",
            )
            activities.append(activity)

    # Add activities based on interests
    categories = interests if interests else ["sightseeing", "food", "cultural"]
    for category in categories:
        if category in activity_templates:
            for template in activity_templates[category][:2]:  # Add 2 per category
                activity = Activity(
                    name=f"{template['name']} in {city}",
                    description=f"Experience {city}'s {category} scene",
                    duration_hours=template["duration"],
                    price_per_person=template["price"],
                    category=category,
                    recommended_time=template["time"],
                )
                activities.append(activity)

    return {
        "status": "success",
        "city": city,
        "activities": [activity.model_dump() for activity in activities],
        "total_activities": len(activities),
        "categories": list(set(a.category for a in activities)),
    }


def create_itinerary(
    city: str,
    start_date: str,
    end_date: str,
    activities: list = None,
    preferences: list = None,
) -> dict:
    """
    Create a day-by-day itinerary for a trip.

    Args:
        city: City name
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        activities: Optional list of specific activities to include
        preferences: Travel preferences

    Returns:
        Dictionary with daily itinerary
    """
    try:
        # Parse dates
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")
        num_days = (end - start).days + 1

        if num_days <= 0:
            return {
                "status": "error",
                "message": "End date must be after or equal to start date",
            }

        # Get activities if not provided
        if not activities:
            activity_data = search_activities(city, preferences, num_days)
            activities = activity_data.get("activities", [])

        # Create daily itineraries
        daily_plans = []
        activity_index = 0

        for day_num in range(num_days):
            current_date = start + timedelta(days=day_num)

            # Assign activities to time slots
            morning = None
            afternoon = None
            evening = None

            # Assign activities based on recommended times
            for _ in range(3):  # Try to fill 3 slots per day
                if activity_index < len(activities):
                    activity = activities[activity_index]

                    if activity.get("recommended_time") == "morning" and not morning:
                        morning = Activity(**activity)
                    elif (
                        activity.get("recommended_time") == "afternoon"
                        and not afternoon
                    ):
                        afternoon = Activity(**activity)
                    elif activity.get("recommended_time") == "evening" and not evening:
                        evening = Activity(**activity)
                    elif activity.get("recommended_time") == "any":
                        # Fill any empty slot
                        if not morning:
                            morning = Activity(**activity)
                        elif not afternoon:
                            afternoon = Activity(**activity)
                        elif not evening:
                            evening = Activity(**activity)

                    activity_index += 1

            # Create day itinerary
            day_plan = DayItinerary(
                day=day_num + 1,
                day_date=current_date.date(),
                morning_activity=morning,
                afternoon_activity=afternoon,
                evening_activity=evening,
                meals_recommendations=[
                    "Breakfast: Local cafe near your hotel",
                    f"Lunch: Restaurant in {morning.name.split(' in ')[0] if morning else 'city center'}",
                    f"Dinner: {city} specialty restaurant",
                ],
            )
            daily_plans.append(day_plan)

        return {
            "status": "success",
            "destination": city,
            "start_date": start_date,
            "end_date": end_date,
            "total_days": num_days,
            "daily_itinerary": [day.model_dump() for day in daily_plans],
            "tips": [
                "Book popular attractions in advance",
                "Check opening hours before visiting",
                "Keep some flexibility for spontaneous discoveries",
                "Consider travel time between activities",
            ],
        }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": "Unable to create itinerary. Please check your input.",
        }


# Create the activity agent
activity_agent = Agent(
    name="activity_agent",
    model="gemini-2.0-flash",
    description="A specialized agent for planning activities and creating itineraries.",
    instruction="""You are an expert travel activity planner. Your role is to help users discover amazing experiences and create well-organized itineraries for their trips.

When planning activities:
1. Use the search_activities tool to find things to do
2. Use the create_itinerary tool to organize activities by day
3. Consider the destination's must-see attractions and local experiences
4. Use Google Search for up-to-date information on events and seasonal activities
5. Balance different types of activities (cultural, adventure, relaxation, food)

Key responsibilities:
- Suggest activities that match the traveler's interests and energy level
- Create logical daily itineraries that minimize travel time between activities
- Consider opening hours, best times to visit, and crowd levels
- Include a mix of famous attractions and hidden gems
- Account for meals and rest time in the schedule
- Suggest alternatives for different weather conditions

When presenting itineraries:
- Organize by day with morning, afternoon, and evening activities
- Include estimated duration and costs
- Provide practical tips (what to bring, how to book, best photo spots)
- Suggest nearby restaurants for meals
- Allow flexibility for spontaneous exploration

Always consider:
- The traveler's pace (relaxed vs. packed schedule)
- Budget constraints
- Physical requirements of activities
- Weather and seasonal factors
- Local events or festivals during the travel dates""",
    tools=[search_activities, create_itinerary, google_search],
)
