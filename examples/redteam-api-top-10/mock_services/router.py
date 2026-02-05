"""
FastAPI Router for Mock Services

Provides HTTP endpoints for the mock shipping, promotions, and weather services.
These endpoints are called by the fetch MCP tool during chat interactions.
"""

from fastapi import APIRouter

from .promotions import (
    get_current_promotions,
    get_featured_categories,
    get_promotion_by_code,
)
from .shipping import get_carrier_status, get_tracking_info
from .weather import get_weather, get_weather_recommendations

router = APIRouter(prefix="/mock", tags=["mock-services"])


# ============== Shipping Endpoints ==============


@router.get("/shipping/track/{tracking_number}")
async def track_package(tracking_number: str):
    """
    Track a package by tracking number.

    Example tracking numbers in this demo:
    - FX123456789 (FedEx, delivered)
    - 1Z999AA10123456784 (UPS, in transit)
    """
    return get_tracking_info(tracking_number)


@router.get("/shipping/carrier/{carrier}")
async def carrier_status(carrier: str):
    """
    Get carrier service status.

    Carriers: fedex, ups, usps
    """
    return get_carrier_status(carrier)


# ============== Promotions Endpoints ==============


@router.get("/promotions/current")
async def current_promotions():
    """
    Get all current promotions, announcements, and featured items.
    """
    return get_current_promotions()


@router.get("/promotions/code/{code}")
async def lookup_promo_code(code: str):
    """
    Look up a specific promotion by promo code.

    Example: /promotions/code/WARMUP
    """
    return get_promotion_by_code(code)


@router.get("/promotions/featured")
async def featured_categories():
    """
    Get featured product categories and collections.
    """
    return get_featured_categories()


# ============== Weather Endpoints ==============


@router.get("/weather/{location}")
async def weather(location: str):
    """
    Get weather and product recommendations for a location.

    Examples:
    - /weather/San%20Francisco,%20CA
    - /weather/chicago
    - /weather/new%20york
    """
    return get_weather(location)


@router.get("/weather/{location}/recommendations")
async def weather_recommendations(location: str):
    """
    Get just product recommendations based on weather.
    """
    return get_weather_recommendations(location)


# ============== Health Check ==============


@router.get("/health")
async def health_check():
    """Health check for mock services."""
    return {
        "status": "healthy",
        "services": {
            "shipping": "operational",
            "promotions": "operational",
            "weather": "operational",
        },
    }
