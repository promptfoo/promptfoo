"""
Travel coordinator agent - the main orchestrator of the travel planning system.
"""

from datetime import datetime
from google.adk.agents import Agent
from google.adk.tools import google_search
from tools.weather_tool import get_weather_forecast
from tools.destination_tool import get_destination_info, get_budget_estimate

# Import sub-agents
from agents.flight_agent import flight_agent
from agents.hotel_agent import hotel_agent
from agents.activity_agent import activity_agent


def check_weather(city: str, travel_date: str) -> dict:
    """Check weather for travel planning."""
    try:
        date_obj = datetime.strptime(travel_date, "%Y-%m-%d").date()
        return get_weather_forecast(city, date_obj)
    except Exception:
        return {"status": "error", "message": "Invalid date format"}


def get_destination_overview(city: str) -> dict:
    """Get comprehensive destination information."""
    return get_destination_info(city)


def estimate_trip_budget(
    city: str, days: int, budget_level: str = "mid", travelers: int = 1
) -> dict:
    """Estimate total trip budget."""
    budget = get_budget_estimate(city, days, budget_level)
    if travelers > 1:
        budget["total_estimate"] *= travelers
        budget["travelers"] = travelers
    return budget


# Create the coordinator agent with sub-agents
travel_coordinator = Agent(
    name="travel_coordinator",
    model="gemini-2.5-flash-preview-04-17",
    description="A master travel planning coordinator that orchestrates specialized agents to create comprehensive travel plans.",
    instruction="""You are the lead travel planning coordinator. You manage a team of specialized agents to help users plan amazing trips.

Your team consists of:
- **Flight Agent**: Searches and recommends flights
- **Hotel Agent**: Finds and suggests accommodations  
- **Activity Agent**: Plans activities and creates itineraries

You also have access to tools for:
- Weather information
- Destination facts and tips
- Budget estimation
- Google Search for additional research

When a user asks for travel planning help:

1. **Understand the Request**: Identify key details like destination, dates, budget, interests, number of travelers

2. **Gather Initial Information**:
   - Use get_destination_overview for destination insights
   - Check weather with check_weather tool
   - Estimate budget with estimate_trip_budget tool

3. **Coordinate Specialists**: Based on what the user needs, engage the appropriate agents:
   - For complete trip planning: Use all three agents in sequence
   - For specific requests: Use only the relevant agent(s)

4. **Compile Results**: Combine outputs from all agents and tools into a cohesive travel plan

5. **Present Comprehensive Plan**: Include:
   - Destination overview and travel tips
   - Flight options with prices
   - Hotel recommendations
   - Day-by-day itinerary with activities
   - Weather forecast and packing suggestions
   - Total budget estimate
   - Important reminders (visa, vaccines, etc.)

Always maintain a friendly, helpful tone and ask for clarification if needed. Ensure all recommendations fit within the user's constraints (budget, dates, preferences).

Remember: You're not just listing options - you're crafting a complete, actionable travel experience.""",
    tools=[
        check_weather,
        get_destination_overview,
        estimate_trip_budget,
        google_search,
    ],
    sub_agents=[flight_agent, hotel_agent, activity_agent],
)
