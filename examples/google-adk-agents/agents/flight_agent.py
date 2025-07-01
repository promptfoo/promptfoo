"""
Flight search specialist agent using Google ADK with OpenTelemetry tracing.
"""

from datetime import datetime, timedelta
from google.adk.agents import Agent
from google.adk.tools import google_search
from models import Flight

# OpenTelemetry imports for tracing
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

# Get tracer for this module
tracer = trace.get_tracer("adk.flight_agent")


def create_mock_flights(origin: str, destination: str, date: datetime) -> list:
    """Create mock flight data for demonstration."""
    with tracer.start_span("flight.create_mock_data") as span:
        span.set_attribute("origin", origin)
        span.set_attribute("destination", destination)
        span.set_attribute("date", date.isoformat())
        
        # In production, this would call a real flight API
        airlines = ["United", "Delta", "American", "JetBlue", "Southwest"]
        base_price = 300

        flights = []
        for i, airline in enumerate(airlines[:3]):  # Return 3 options
            departure = date.replace(hour=6 + i * 4, minute=0)
            duration = 2.5 + (i * 0.5)
            arrival = departure + timedelta(hours=duration)

            flight = Flight(
                airline=airline,
                flight_number=f"{airline[:2]}{100 + i}",
                departure_airport=origin.upper()[:3],
                arrival_airport=destination.upper()[:3],
                departure_time=departure,
                arrival_time=arrival,
                price=base_price + (i * 50),
                duration_hours=duration,
            )
            flights.append(flight)

        span.set_attribute("flights.count", len(flights))
        span.set_status(Status(StatusCode.OK))
        return flights


def search_flights(
    origin: str, destination: str, departure_date: str, return_date: str = None
) -> dict:
    """
    Search for flights between two cities with tracing.

    Args:
        origin: Origin city
        destination: Destination city
        departure_date: Departure date (YYYY-MM-DD)
        return_date: Optional return date for round trips

    Returns:
        Dictionary with flight options
    """
    # NOTE: In a full ADK implementation with proper session management,
    # these traces would be linked to the parent coordinator span.
    # This demonstrates how sub-agents should be instrumented for observability.
    
    with tracer.start_span("flight.search") as span:
        span.set_attribute("search.origin", origin)
        span.set_attribute("search.destination", destination)
        span.set_attribute("search.departure_date", departure_date)
        span.set_attribute("search.trip_type", "round-trip" if return_date else "one-way")
        
        try:
            # Parse dates
            with tracer.start_span("flight.parse_dates"):
                dep_date = datetime.strptime(departure_date, "%Y-%m-%d")

            # Generate mock flights
            outbound_flights = create_mock_flights(origin, destination, dep_date)

            result = {
                "status": "success",
                "search_criteria": {
                    "origin": origin,
                    "destination": destination,
                    "departure_date": departure_date,
                    "trip_type": "round-trip" if return_date else "one-way",
                },
                "outbound_flights": [flight.model_dump() for flight in outbound_flights],
                "return_flights": [],
            }

            if return_date:
                with tracer.start_span("flight.search_return"):
                    ret_date = datetime.strptime(return_date, "%Y-%m-%d")
                    return_flights = create_mock_flights(destination, origin, ret_date)
                    result["return_flights"] = [
                        flight.model_dump() for flight in return_flights
                    ]
                    result["search_criteria"]["return_date"] = return_date

            # Add pricing summary
            with tracer.start_span("flight.calculate_pricing") as price_span:
                outbound_prices = [f.price for f in outbound_flights]
                result["price_summary"] = {
                    "lowest_outbound": min(outbound_prices),
                    "average_outbound": sum(outbound_prices) / len(outbound_prices),
                    "currency": "USD",
                }
                price_span.set_attribute("price.lowest", min(outbound_prices))
                price_span.set_attribute("price.average", sum(outbound_prices) / len(outbound_prices))

            span.set_attribute("result.flights_found", len(outbound_flights))
            span.set_status(Status(StatusCode.OK))
            return result

        except Exception as e:
            span.record_exception(e)
            span.set_status(Status(StatusCode.ERROR, str(e)))
            return {
                "status": "error",
                "error": str(e),
                "message": "Unable to search flights. Please check your input.",
            }


# Create the flight agent
flight_agent = Agent(
    name="flight_agent",
    model="gemini-2.5-flash-preview-04-17",
    description="A specialized agent for searching and recommending flights.",
    instruction="""You are a flight search specialist. Your role is to help users find the best flight options for their travel needs.

When searching for flights:
1. Use the search_flights tool to find available options
2. Consider both price and convenience (departure times, duration, stops)
3. If using Google Search, look for current flight prices and availability
4. Provide clear recommendations based on the user's priorities

Key responsibilities:
- Find flights between cities on specific dates
- Compare prices across different airlines
- Suggest optimal departure times
- Advise on booking strategies (e.g., best days to fly)
- Highlight any important considerations (e.g., baggage fees, layovers)

Always present flight options in a clear, organized manner with:
- Airline and flight number
- Departure and arrival times
- Duration
- Price
- Any relevant notes (direct vs connecting, etc.)

If dates are flexible, suggest checking nearby dates for better prices.""",
    tools=[search_flights, google_search],
)
