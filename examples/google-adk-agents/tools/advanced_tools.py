"""
Advanced tool integrations for the travel planning system.
Demonstrates OpenAPI tools, MCP tools, and third-party integrations.
"""

import asyncio
from typing import Dict, List, Optional

from google.adk.tools import (
    ApiHubToolset,
    FunctionTool,
    LangchainTool,
    McpToolset,
    OpenAPIToolset,
)
from google.adk.tools.mcp import McpClient


# Example 1: OpenAPI Tool Integration
# Convert any REST API to an ADK tool using OpenAPI spec
def create_flight_booking_tools():
    """Create tools from an airline's OpenAPI specification"""

    # Initialize from OpenAPI spec (can be URL, file path, or dict)
    flight_tools = OpenAPIToolset(
        spec_path="https://api.example-airline.com/openapi.json",
        # Optional: Override base URL for testing
        base_url="https://staging.example-airline.com",
        # Optional: Add authentication
        headers={"Authorization": "Bearer ${FLIGHT_API_KEY}", "X-API-Version": "2.0"},
    )

    # Get all generated tools
    tools = flight_tools.get_tools()

    # You can also get specific operations if needed:
    # search_flights = flight_tools.get_tool("searchFlights")
    # book_flight = flight_tools.get_tool("createBooking")

    return tools


# Example 2: MCP (Model Context Protocol) Tools
# Access standardized tools from MCP servers
async def create_mcp_tools():
    """Connect to MCP servers for advanced capabilities"""

    # Connect to a file system MCP server
    fs_client = McpClient("npx", ["-y", "@modelcontextprotocol/server-filesystem"])
    fs_tools = McpToolset(fs_client)

    # Connect to Google Maps MCP server
    maps_client = McpClient("npx", ["-y", "@modelcontextprotocol/server-googlemaps"])
    maps_tools = McpToolset(maps_client)

    # Get all available tools
    all_fs_tools = await fs_tools.get_tools()
    all_maps_tools = await maps_tools.get_tools()

    return all_fs_tools + all_maps_tools


# Example 3: Google Cloud Integration via API Hub
def create_cloud_tools():
    """Integrate with Google Cloud services through API Hub"""

    # Connect to enterprise APIs via Apigee API Hub
    api_hub_tools = ApiHubToolset(
        project_id="${GOOGLE_CLOUD_PROJECT}",
        location="us-central1",
        api_hub_id="travel-apis",
    )

    # Get tools for specific APIs
    hotel_api = api_hub_tools.get_api_tools("hotel-inventory-api")
    payment_api = api_hub_tools.get_api_tools("payment-processing-api")

    return hotel_api + payment_api


# Example 4: LangChain Tool Integration
# Use the vast ecosystem of LangChain tools
def create_langchain_tools():
    """Integrate popular LangChain tools"""

    # Use Tavily for advanced web search
    from langchain_community.tools.tavily_search import TavilySearchResults

    tavily_tool = LangchainTool(
        tool=TavilySearchResults(
            max_results=10,
            search_depth="advanced",
            include_raw_content=True,
            api_key="${TAVILY_API_KEY}",
        )
    )

    # Use SerpAPI for Google search results
    from langchain_community.tools.serpapi import SerpAPIWrapper

    serp_tool = LangchainTool(
        tool=SerpAPIWrapper(
            serpapi_api_key="${SERPAPI_KEY}",
            params={"engine": "google_flights", "gl": "us", "hl": "en"},
        )
    )

    return [tavily_tool, serp_tool]


# Example 5: Caching Function Tool
# Implement caching as recommended in ADK best practices
class CachedPricingTool:
    """A tool that caches pricing data to avoid redundant API calls"""

    def __init__(self):
        self.cache = {}
        self.cache_duration = 3600  # 1 hour

    async def get_hotel_prices(self, city: str, check_in: str, check_out: str) -> Dict:
        """
        Get hotel prices with intelligent caching.

        Args:
            city: Destination city
            check_in: Check-in date (YYYY-MM-DD)
            check_out: Check-out date (YYYY-MM-DD)

        Returns:
            Dict with hotel prices and metadata
        """
        # Generate cache key
        cache_key = f"{city}:{check_in}:{check_out}"

        # Check cache
        if cache_key in self.cache:
            cached_data = self.cache[cache_key]
            if (
                cached_data["timestamp"] + self.cache_duration
                > asyncio.get_event_loop().time()
            ):
                return {
                    "status": "success",
                    "data": cached_data["data"],
                    "cached": True,
                    "cache_age": asyncio.get_event_loop().time()
                    - cached_data["timestamp"],
                }

        # If not in cache, fetch fresh data
        # (This would normally call an actual API)
        fresh_data = {
            "hotels": [
                {"name": "Grand Hotel", "price": 250, "rating": 4.5},
                {"name": "Budget Inn", "price": 89, "rating": 3.8},
                {"name": "Luxury Resort", "price": 450, "rating": 4.9},
            ],
            "average_price": 263,
            "availability": "high",
        }

        # Store in cache
        self.cache[cache_key] = {
            "data": fresh_data,
            "timestamp": asyncio.get_event_loop().time(),
        }

        return {"status": "success", "data": fresh_data, "cached": False}


# Create the cached pricing tool
cached_pricing = CachedPricingTool()
hotel_price_tool = FunctionTool(
    func=cached_pricing.get_hotel_prices, name="get_hotel_prices_cached"
)


# Example 6: Authentication-Required Tool
# Demonstrates the authentication callback pattern
def create_authenticated_booking_tool():
    """Create a tool that requires user authentication"""

    async def book_hotel_with_auth(
        hotel_id: str,
        check_in: str,
        check_out: str,
        guest_name: str,
        auth_token: Optional[str] = None,
    ) -> Dict:
        """
        Book a hotel room (requires authentication).

        The ADK framework will handle authentication flow if token is missing.
        """
        if not auth_token:
            # This will trigger ADK's authentication flow
            return {
                "status": "auth_required",
                "auth_config": {
                    "type": "oauth2",
                    "auth_url": "https://auth.booking-platform.com/oauth/authorize",
                    "token_url": "https://auth.booking-platform.com/oauth/token",
                    "scopes": ["bookings.write", "user.read"],
                },
            }

        # Proceed with booking using the auth token
        booking_result = {
            "status": "success",
            "booking_id": f"BK-{hotel_id}-{check_in}",
            "confirmation_code": "ABC123",
            "total_price": 750.00,
            "message": "Hotel booked successfully",
        }

        return booking_result

    return FunctionTool(
        func=book_hotel_with_auth, name="book_hotel_authenticated", requires_auth=True
    )


# Example 7: Multi-Step Workflow Tool
# Demonstrates complex tool orchestration
class TripOptimizer:
    """Optimizes multi-city trips using various data sources"""

    async def optimize_route(self, cities: List[str], preferences: Dict) -> Dict:
        """
        Optimize travel route considering distance, cost, and preferences.

        This demonstrates how a single tool can orchestrate multiple operations.
        """
        # Step 1: Calculate distances between cities
        distances = await self._calculate_distances(cities)

        # Step 2: Get pricing for each route
        route_prices = await self._get_route_prices(cities)

        # Step 3: Factor in user preferences
        weights = {
            "distance": preferences.get("minimize_distance", 0.3),
            "cost": preferences.get("minimize_cost", 0.5),
            "attractions": preferences.get("maximize_attractions", 0.2),
        }

        # Step 4: Run optimization algorithm
        optimal_route = self._run_optimization(cities, distances, route_prices, weights)

        return {
            "status": "success",
            "optimal_route": optimal_route,
            "total_distance": sum(distances.values()),
            "estimated_cost": sum(route_prices.values()),
            "savings": self._calculate_savings(optimal_route, cities),
        }

    async def _calculate_distances(self, cities: List[str]) -> Dict:
        # Implementation would use real distance API
        return {"total": 1500}

    async def _get_route_prices(self, cities: List[str]) -> Dict:
        # Implementation would check flight/train prices
        return {"total": 850}

    def _run_optimization(self, cities, distances, prices, weights):
        # Implementation would use optimization algorithm
        return cities  # Simplified for example

    def _calculate_savings(self, optimal, original):
        # Calculate how much the optimization saved
        return {"amount": 150, "percentage": 15}


# Create the optimization tool
optimizer = TripOptimizer()
route_optimizer_tool = FunctionTool(
    func=optimizer.optimize_route, name="optimize_travel_route"
)


# Aggregate all advanced tools for the coordinator
def get_all_advanced_tools():
    """Get all advanced tools for the travel coordinator"""
    tools = []

    # Add OpenAPI tools
    tools.extend(create_flight_booking_tools())

    # Add LangChain tools
    tools.extend(create_langchain_tools())

    # Add custom tools
    tools.extend(
        [hotel_price_tool, create_authenticated_booking_tool(), route_optimizer_tool]
    )

    return tools
