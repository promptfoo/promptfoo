"""
Mock Shipping Tracker Service

Simulates carrier tracking APIs (FedEx, UPS) for demo purposes.
"""

from datetime import datetime, timedelta
from typing import Optional

# Mock tracking data based on known tracking numbers in the database
MOCK_TRACKING = {
    # Alice's shipped order
    "FX123456789": {
        "carrier": "FedEx",
        "carrier_name": "FedEx Ground",
        "status": "Delivered",
        "estimated_delivery": None,
        "delivered_at": datetime.now() - timedelta(days=12),
        "origin": "Memphis, TN",
        "destination": "San Francisco, CA",
        "history": [
            {
                "date": datetime.now() - timedelta(days=14),
                "status": "Picked up",
                "location": "Memphis, TN",
            },
            {
                "date": datetime.now() - timedelta(days=13),
                "status": "In transit",
                "location": "Phoenix, AZ",
            },
            {
                "date": datetime.now() - timedelta(days=12, hours=6),
                "status": "Out for delivery",
                "location": "San Francisco, CA",
            },
            {
                "date": datetime.now() - timedelta(days=12),
                "status": "Delivered",
                "location": "San Francisco, CA",
            },
        ],
    },
    "1Z999AA10123456784": {
        "carrier": "UPS",
        "carrier_name": "UPS 2-Day Air",
        "status": "In Transit",
        "estimated_delivery": datetime.now() + timedelta(days=1),
        "delivered_at": None,
        "origin": "Louisville, KY",
        "destination": "San Francisco, CA",
        "history": [
            {
                "date": datetime.now() - timedelta(days=3),
                "status": "Picked up",
                "location": "Louisville, KY",
            },
            {
                "date": datetime.now() - timedelta(days=2),
                "status": "Departed facility",
                "location": "Louisville, KY",
            },
            {
                "date": datetime.now() - timedelta(days=1),
                "status": "In transit",
                "location": "Denver, CO",
            },
            {
                "date": datetime.now() - timedelta(hours=6),
                "status": "Arrived at facility",
                "location": "Oakland, CA",
            },
        ],
    },
    # Bob's delivered order
    "FX987654321": {
        "carrier": "FedEx",
        "carrier_name": "FedEx Ground",
        "status": "Delivered",
        "estimated_delivery": None,
        "delivered_at": datetime.now() - timedelta(days=19),
        "origin": "Memphis, TN",
        "destination": "New York, NY",
        "history": [
            {
                "date": datetime.now() - timedelta(days=21),
                "status": "Picked up",
                "location": "Memphis, TN",
            },
            {
                "date": datetime.now() - timedelta(days=20),
                "status": "In transit",
                "location": "Nashville, TN",
            },
            {
                "date": datetime.now() - timedelta(days=19, hours=8),
                "status": "Out for delivery",
                "location": "New York, NY",
            },
            {
                "date": datetime.now() - timedelta(days=19),
                "status": "Delivered",
                "location": "New York, NY",
            },
        ],
    },
    # Charlie's shipped order
    "1Z999BB20123456785": {
        "carrier": "UPS",
        "carrier_name": "UPS Ground",
        "status": "In Transit",
        "estimated_delivery": datetime.now() + timedelta(days=2),
        "delivered_at": None,
        "origin": "Louisville, KY",
        "destination": "Chicago, IL",
        "history": [
            {
                "date": datetime.now() - timedelta(days=5),
                "status": "Picked up",
                "location": "Louisville, KY",
            },
            {
                "date": datetime.now() - timedelta(days=4),
                "status": "Departed facility",
                "location": "Louisville, KY",
            },
            {
                "date": datetime.now() - timedelta(days=2),
                "status": "In transit",
                "location": "Indianapolis, IN",
            },
        ],
    },
    # Diana's delivered orders
    "FX111222333": {
        "carrier": "FedEx",
        "carrier_name": "FedEx Ground",
        "status": "Delivered",
        "estimated_delivery": None,
        "delivered_at": datetime.now() - timedelta(days=28),
        "origin": "Memphis, TN",
        "destination": "Austin, TX",
        "history": [
            {
                "date": datetime.now() - timedelta(days=30),
                "status": "Picked up",
                "location": "Memphis, TN",
            },
            {
                "date": datetime.now() - timedelta(days=29),
                "status": "In transit",
                "location": "Dallas, TX",
            },
            {
                "date": datetime.now() - timedelta(days=28),
                "status": "Delivered",
                "location": "Austin, TX",
            },
        ],
    },
    "FX444555666": {
        "carrier": "FedEx",
        "carrier_name": "FedEx Express",
        "status": "Delivered",
        "estimated_delivery": None,
        "delivered_at": datetime.now() - timedelta(days=8),
        "origin": "Memphis, TN",
        "destination": "Austin, TX",
        "history": [
            {
                "date": datetime.now() - timedelta(days=10),
                "status": "Picked up",
                "location": "Memphis, TN",
            },
            {
                "date": datetime.now() - timedelta(days=9),
                "status": "In transit",
                "location": "Dallas, TX",
            },
            {
                "date": datetime.now() - timedelta(days=8),
                "status": "Delivered",
                "location": "Austin, TX",
            },
        ],
    },
    # Eve's shipped order
    "1Z999CC30123456786": {
        "carrier": "UPS",
        "carrier_name": "UPS Ground",
        "status": "Out for Delivery",
        "estimated_delivery": datetime.now(),
        "delivered_at": None,
        "origin": "Louisville, KY",
        "destination": "Seattle, WA",
        "history": [
            {
                "date": datetime.now() - timedelta(days=4),
                "status": "Picked up",
                "location": "Louisville, KY",
            },
            {
                "date": datetime.now() - timedelta(days=3),
                "status": "Departed facility",
                "location": "Louisville, KY",
            },
            {
                "date": datetime.now() - timedelta(days=2),
                "status": "In transit",
                "location": "Salt Lake City, UT",
            },
            {
                "date": datetime.now() - timedelta(days=1),
                "status": "Arrived at facility",
                "location": "Seattle, WA",
            },
            {
                "date": datetime.now() - timedelta(hours=4),
                "status": "Out for delivery",
                "location": "Seattle, WA",
            },
        ],
    },
}


def format_datetime(dt: Optional[datetime]) -> Optional[str]:
    """Format datetime for JSON response."""
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def get_tracking_info(tracking_number: str) -> dict:
    """
    Get tracking information for a package.

    Args:
        tracking_number: The carrier tracking number

    Returns:
        Tracking information dict or error
    """
    # Normalize tracking number
    tracking_number = tracking_number.upper().strip()

    if tracking_number in MOCK_TRACKING:
        data = MOCK_TRACKING[tracking_number]

        # Format history with dates as strings
        history = []
        for event in data["history"]:
            history.append(
                {
                    "timestamp": format_datetime(event["date"]),
                    "status": event["status"],
                    "location": event["location"],
                }
            )

        return {
            "tracking_number": tracking_number,
            "carrier": data["carrier"],
            "carrier_service": data["carrier_name"],
            "status": data["status"],
            "estimated_delivery": format_datetime(data["estimated_delivery"]),
            "delivered_at": format_datetime(data["delivered_at"]),
            "origin": data["origin"],
            "destination": data["destination"],
            "history": history,
        }

    # Unknown tracking number - return generic response
    return {
        "tracking_number": tracking_number,
        "carrier": "Unknown",
        "status": "Not Found",
        "error": f"No tracking information found for {tracking_number}. Please check the tracking number and try again.",
        "hint": "Valid tracking numbers in this demo: "
        + ", ".join(MOCK_TRACKING.keys()),
    }


def get_carrier_status(carrier: str) -> dict:
    """Get carrier service status."""
    carriers = {
        "fedex": {
            "name": "FedEx",
            "status": "Operational",
            "services": ["Ground", "Express", "Priority Overnight"],
            "delays": None,
        },
        "ups": {
            "name": "UPS",
            "status": "Operational",
            "services": ["Ground", "2-Day Air", "Next Day Air"],
            "delays": None,
        },
        "usps": {
            "name": "USPS",
            "status": "Minor Delays",
            "services": ["Priority Mail", "First Class", "Media Mail"],
            "delays": "Holiday volume causing 1-2 day delays in some regions",
        },
    }

    carrier_lower = carrier.lower()
    if carrier_lower in carriers:
        return carriers[carrier_lower]

    return {
        "name": carrier,
        "status": "Unknown",
        "error": f"Unknown carrier: {carrier}",
    }
