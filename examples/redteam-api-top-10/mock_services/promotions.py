"""
Mock Promotions Service

Provides current promotions, announcements, and deals for the swag store.
"""

from datetime import datetime, timedelta


def get_current_promotions() -> dict:
    """Get all current promotions and announcements."""
    now = datetime.now()

    promotions = [
        {
            "id": "promo_holiday_2024",
            "title": "Holiday Hoodie Sale",
            "description": "Get 20% off all hoodies! Use code WARMUP at checkout.",
            "discount_type": "percentage",
            "discount_value": 20,
            "applies_to": [
                "HOODIE-GRY-S",
                "HOODIE-GRY-M",
                "HOODIE-GRY-L",
                "HOODIE-GRY-XL",
                "HOODIE-NVY-M",
                "HOODIE-NVY-L",
            ],
            "category": "apparel",
            "code": "WARMUP",
            "starts": (now - timedelta(days=5)).strftime("%Y-%m-%d"),
            "expires": (now + timedelta(days=20)).strftime("%Y-%m-%d"),
            "active": True,
        },
        {
            "id": "promo_sticker_bundle",
            "title": "Sticker Bundle Deal",
            "description": "Buy any 2 sticker packs, get 1 free!",
            "discount_type": "buy_x_get_y",
            "discount_value": "2+1",
            "applies_to": ["STICKER-LOGO-5PK", "STICKER-DEV-10PK", "STICKER-HOLO-3PK"],
            "category": "stickers",
            "code": None,  # Auto-applied
            "starts": (now - timedelta(days=30)).strftime("%Y-%m-%d"),
            "expires": (now + timedelta(days=60)).strftime("%Y-%m-%d"),
            "active": True,
        },
        {
            "id": "promo_new_arrival",
            "title": "New Arrival: CloudCo Beanie",
            "description": "Perfect for the cold weather! Our new beanies are now in stock.",
            "discount_type": "announcement",
            "discount_value": None,
            "applies_to": ["HAT-BEANIE-GRY", "HAT-BEANIE-BLK"],
            "category": "accessories",
            "code": None,
            "starts": (now - timedelta(days=7)).strftime("%Y-%m-%d"),
            "expires": (now + timedelta(days=30)).strftime("%Y-%m-%d"),
            "active": True,
        },
    ]

    announcements = [
        {
            "id": "announce_q1_points",
            "title": "Q1 Points Refresh",
            "message": "Your quarterly 100 swag points will be credited on January 1st!",
            "priority": "info",
            "date": (now + timedelta(days=22)).strftime("%Y-%m-%d"),
        },
        {
            "id": "announce_extended_sizes",
            "title": "Extended Sizes Coming 2025",
            "message": "We heard you! Extended sizes (3XL-5XL) coming in Q2 2025.",
            "priority": "info",
            "date": "2025-04-01",
        },
        {
            "id": "announce_eco_packaging",
            "title": "Now Using Eco-Friendly Packaging",
            "message": "All orders now ship in 100% recyclable, plastic-free packaging!",
            "priority": "success",
            "date": (now - timedelta(days=14)).strftime("%Y-%m-%d"),
        },
    ]

    featured_items = [
        {
            "product_id": "HOODIE-GRY-M",
            "name": "CloudCo Zip Hoodie",
            "reason": "Best Seller",
            "price_points": 50,
        },
        {
            "product_id": "TUMBLER-BLK-16",
            "name": "CloudCo Travel Tumbler",
            "reason": "Staff Pick",
            "price_points": 25,
        },
        {
            "product_id": "STICKER-DEV-10PK",
            "name": "Developer Sticker Pack",
            "reason": "Most Popular",
            "price_points": 10,
        },
    ]

    return {
        "promotions": promotions,
        "announcements": announcements,
        "featured": featured_items,
        "last_updated": now.strftime("%Y-%m-%d %H:%M:%S"),
    }


def get_promotion_by_code(code: str) -> dict:
    """Look up a specific promotion by code."""
    promotions = get_current_promotions()["promotions"]

    for promo in promotions:
        if promo.get("code") and promo["code"].upper() == code.upper():
            return {"found": True, "promotion": promo}

    return {
        "found": False,
        "error": f"No promotion found with code '{code}'",
        "hint": "Current valid codes: WARMUP",
    }


def get_featured_categories() -> dict:
    """Get featured product categories."""
    return {
        "categories": [
            {
                "name": "Winter Essentials",
                "description": "Stay warm with our hoodies and beanies",
                "products": [
                    "HOODIE-GRY-M",
                    "HOODIE-NVY-M",
                    "HAT-BEANIE-GRY",
                    "MUG-WHT-12",
                ],
            },
            {
                "name": "Work From Home",
                "description": "Upgrade your home office setup",
                "products": ["MOUSEPAD-BLK", "MUG-BLK-12", "TUMBLER-BLK-16"],
            },
            {
                "name": "Laptop Essentials",
                "description": "Stickers for your laptop, backpack for your laptop",
                "products": ["STICKER-DEV-10PK", "STICKER-HOLO-3PK", "BACKPACK-BLK"],
            },
        ]
    }
