"""
Mock provider for Google ADK travel planning agents.
This simulates the responses that would come from the actual ADK agents.
"""

import os
import sys
from typing import Any, Dict

# Add parent directory to path to import our modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """Mock provider function that simulates ADK travel planning agent responses."""

    # Convert prompt to lowercase for matching
    prompt_lower = prompt.lower()

    # Simulate different agent responses based on the query
    if (
        "weather" in prompt_lower
        and "paris" in prompt_lower
        and "april" in prompt_lower
    ):
        response = "Paris in April offers mild spring weather perfect for exploring the city. Temperatures typically range from 10-16°C (50-61°F). April sees the city coming to life with spring blooms in parks and gardens."
    elif (
        "weather" in prompt_lower
        and "tokyo" in prompt_lower
        and "april" in prompt_lower
    ):
        response = "Based on the weather information I found, Tokyo in April is generally pleasant with mild temperatures averaging 10-20°C (50-68°F). April is famous for cherry blossom season (sakura), typically peaking in early April."
    elif (
        "flight" in prompt_lower
        and "new york" in prompt_lower
        and "london" in prompt_lower
    ):
        response = "I found several flight options from New York to London for Christmas week. Direct flights available with British Airways (JFK to LHR, $850), Virgin Atlantic ($820), and American Airlines ($780). Prices are higher due to peak holiday season."
    elif "flight" in prompt_lower and "chicago" in prompt_lower:
        response = "For urgent travel to Chicago tomorrow, available options include: United departing 6:30 AM ($450), American departing 7:15 AM ($425), Southwest departing 2:00 PM ($380). All flights have seats available."
    elif "hotel" in prompt_lower and "barcelona" in prompt_lower:
        response = "I found several budget-friendly hotels in Barcelona under $100/night: Hotel Barcelona Center ($85/night), Hostal Grau ($70/night), Hotel Curious ($95/night). All in good locations with positive reviews."
    elif "hotel" in prompt_lower and "times square" in prompt_lower:
        response = "Hotels near Times Square for business travel: Hilton Times Square ($280/night with business center), W New York Times Square ($320/night with excellent WiFi), Crowne Plaza Times Square ($250/night). All have availability."
    elif (
        "tokyo" in prompt_lower
        and "3-day" in prompt_lower
        and "december" in prompt_lower
    ):
        response = "Here's your 3-day Tokyo itinerary for December 15-17, 2024. Day 1: Arrive, check into Shinjuku hotel, visit Senso-ji Temple and Asakusa, dinner in Shibuya. Day 2: teamLab Borderless, shopping in Harajuku, Tokyo Skytree for sunset. Day 3: Tsukiji Market breakfast, Meiji Shrine, Ginza shopping before departure. December weather is cool (5-12°C), budget estimate $200-300/day."
    elif "rome" in prompt_lower and "art" in prompt_lower:
        response = "Top attractions in Rome for art lovers: Vatican Museums (Sistine Chapel), Galleria Borghese (Bernini sculptures), Capitoline Museums (Roman statues), MAXXI (contemporary art). Hidden gems include Church of San Luigi dei Francesi (Caravaggio) and Palazzo Barberini."
    elif "orlando" in prompt_lower and (
        "family" in prompt_lower or "kids" in prompt_lower
    ):
        response = "Perfect family weekend in Orlando: Saturday at Magic Kingdom (focus on Fantasyland/Tomorrowland), pool time, Disney Springs dinner. Sunday at Universal's Islands of Adventure (Harry Potter world), ICON Park observation wheel, mini golf. Stay at Disney's Art of Animation or Universal's Cabana Bay."
    elif (
        "paris" in prompt_lower
        and "rome" in prompt_lower
        and "barcelona" in prompt_lower
    ) or ("multi-city" in prompt_lower):
        response = "Your 10-day Europe trip itinerary for Paris, Rome, and Barcelona ($3000 budget): Days 1-3 in Paris (Eiffel Tower, Louvre, Notre-Dame, budget $300). Days 4-6 in Rome (Colosseum, Vatican, Trevi Fountain, train from Paris $120, budget $270). Days 7-9 in Barcelona (Sagrada Familia, Park Güell, Las Ramblas, flight from Rome $80, budget $255). Total estimated cost: $2,800 (within budget!)."
    elif (
        "san francisco" in prompt_lower
        and "tokyo" in prompt_lower
        and "march" in prompt_lower
    ):
        response = "Flight options from San Francisco to Tokyo on March 15, 2024: United direct flight departing SFO 1:40 PM, arriving NRT March 16 at 5:35 PM ($950). ANA direct flight departing SFO 12:50 PM, arriving NRT March 16 at 4:45 PM ($1,020). JAL direct flight departing SFO 2:00 PM, arriving HND March 16 at 6:00 PM ($980)."
    elif "chicago" in prompt_lower and (
        "tomorrow" in prompt_lower or "emergency" in prompt_lower
    ):
        response = "For urgent travel to Chicago tomorrow, available options include: United departing 6:30 AM ($450), American departing 7:15 AM ($425), Southwest departing 2:00 PM ($380), Delta departing 3:30 PM ($410). All flights have seats available. For emergencies, airlines may offer flexible rebooking."
    elif "san francisco" in prompt_lower and (
        "romantic" in prompt_lower or "weekend" in prompt_lower
    ):
        response = "Romantic weekend getaways near San Francisco: Napa Valley (wine tasting, hot air balloons, 1 hour drive), Carmel-by-the-Sea (beach walks, art galleries, 2 hours), Half Moon Bay (coastal views, Ritz-Carlton, 45 minutes), Sausalito (waterfront dining, ferry ride, 30 minutes), Big Sur (dramatic coastline, luxury resorts, 2.5 hours)."
    else:
        response = "I'm your ADK travel planning assistant! I can help you with flight searches, hotel bookings, weather information, complete trip itineraries, activity recommendations, and budget planning. Please let me know what specific travel assistance you need!"

    return {
        "output": {
            "response": response,
            "agent": "travel_coordinator",
            "sub_agents_used": ["flight_agent", "hotel_agent", "activity_agent"],
        }
    }
