#!/usr/bin/env python3
"""
Seed the CloudSwag database with demo data.
Run: python scripts/seed_database.py
"""

import hashlib
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path


def hash_password(password: str) -> str:
    """Hash password using SHA256 (use bcrypt in production)."""
    return hashlib.sha256(password.encode()).hexdigest()


# Database path
DB_PATH = Path(__file__).parent.parent / "data" / "swag_store.db"

# Schema
SCHEMA = """
-- Users (linked to JWT sub claim)
-- NOTE: salary and ssn_last_four are SENSITIVE - should not be exposed (API3 vulnerability)
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    department TEXT,
    office_location TEXT,
    swag_points INTEGER DEFAULT 100,
    salary INTEGER,
    ssn_last_four TEXT,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products catalog
-- NOTE: cost_price, profit_margin, supplier_id are INTERNAL - should not be exposed (API3 vulnerability)
CREATE TABLE IF NOT EXISTS products (
    product_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    price_points INTEGER NOT NULL,
    size TEXT,
    color TEXT,
    stock_quantity INTEGER DEFAULT 0,
    weather_tags TEXT,
    is_active BOOLEAN DEFAULT 1,
    cost_price REAL,
    profit_margin REAL,
    supplier_id TEXT
);

-- Orders (user_id MUST match JWT for access)
CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    total_points INTEGER NOT NULL,
    shipping_address TEXT,
    tracking_number TEXT,
    carrier TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Order line items
CREATE TABLE IF NOT EXISTS order_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    points_each INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
"""

# Demo Users - (user_id, email, username, password, full_name, department, office_location, swag_points, salary, ssn_last_four, role)
# All demo passwords are "password123"
# NOTE: salary and ssn_last_four are SENSITIVE data for API3 vulnerability testing
DEMO_PASSWORD = "password123"
USERS = [
    (
        "emp_001",
        "alice.johnson@cloudco.com",
        "alice",
        hash_password(DEMO_PASSWORD),
        "Alice Johnson",
        "Engineering",
        "San Francisco, CA",
        150,
        145000,
        "1234",
        "user",
    ),
    (
        "emp_002",
        "bob.smith@cloudco.com",
        "bob",
        hash_password(DEMO_PASSWORD),
        "Bob Smith",
        "Marketing",
        "New York, NY",
        200,
        95000,
        "5678",
        "user",
    ),
    (
        "emp_003",
        "charlie.brown@cloudco.com",
        "charlie",
        hash_password(DEMO_PASSWORD),
        "Charlie Brown",
        "Sales",
        "Chicago, IL",
        75,
        85000,
        "9012",
        "user",
    ),
    (
        "emp_004",
        "diana.prince@cloudco.com",
        "diana",
        hash_password(DEMO_PASSWORD),
        "Diana Prince",
        "HR",
        "Austin, TX",
        300,
        110000,
        "3456",
        "admin",
    ),
    (
        "emp_005",
        "eve.wilson@cloudco.com",
        "eve",
        hash_password(DEMO_PASSWORD),
        "Eve Wilson",
        "Finance",
        "Seattle, WA",
        125,
        125000,
        "7890",
        "user",
    ),
]

# Products - now with INTERNAL pricing data (cost_price, profit_margin, supplier_id) for API3 vulnerability
# Format: (product_id, name, category, description, price_points, size, color, stock_quantity, weather_tags, cost_price, profit_margin, supplier_id)
PRODUCTS = [
    # T-Shirts - cost around $5, 80% margin
    (
        "TSHIRT-BLU-S",
        "CloudCo Logo Tee",
        "apparel",
        "Classic blue tee with embroidered CloudCo logo",
        25,
        "S",
        "Blue",
        50,
        '["mild", "indoor"]',
        5.00,
        0.80,
        "SUP-APPAREL-001",
    ),
    (
        "TSHIRT-BLU-M",
        "CloudCo Logo Tee",
        "apparel",
        "Classic blue tee with embroidered CloudCo logo",
        25,
        "M",
        "Blue",
        75,
        '["mild", "indoor"]',
        5.00,
        0.80,
        "SUP-APPAREL-001",
    ),
    (
        "TSHIRT-BLU-L",
        "CloudCo Logo Tee",
        "apparel",
        "Classic blue tee with embroidered CloudCo logo",
        25,
        "L",
        "Blue",
        60,
        '["mild", "indoor"]',
        5.25,
        0.79,
        "SUP-APPAREL-001",
    ),
    (
        "TSHIRT-BLU-XL",
        "CloudCo Logo Tee",
        "apparel",
        "Classic blue tee with embroidered CloudCo logo",
        25,
        "XL",
        "Blue",
        40,
        '["mild", "indoor"]',
        5.50,
        0.78,
        "SUP-APPAREL-001",
    ),
    (
        "TSHIRT-BLK-M",
        "CloudCo Dark Mode Tee",
        "apparel",
        "Black tee for dark mode enthusiasts",
        30,
        "M",
        "Black",
        40,
        '["mild", "indoor"]',
        6.00,
        0.80,
        "SUP-APPAREL-001",
    ),
    (
        "TSHIRT-BLK-L",
        "CloudCo Dark Mode Tee",
        "apparel",
        "Black tee for dark mode enthusiasts",
        30,
        "L",
        "Black",
        35,
        '["mild", "indoor"]',
        6.25,
        0.79,
        "SUP-APPAREL-001",
    ),
    (
        "TSHIRT-WHT-M",
        "CloudCo Minimalist Tee",
        "apparel",
        "Clean white design with subtle logo",
        25,
        "M",
        "White",
        45,
        '["mild", "indoor"]',
        4.75,
        0.81,
        "SUP-APPAREL-002",
    ),
    (
        "TSHIRT-WHT-L",
        "CloudCo Minimalist Tee",
        "apparel",
        "Clean white design with subtle logo",
        25,
        "L",
        "White",
        35,
        '["mild", "indoor"]',
        5.00,
        0.80,
        "SUP-APPAREL-002",
    ),
    # Hoodies - cost around $15-18, 70% margin
    (
        "HOODIE-GRY-S",
        "CloudCo Zip Hoodie",
        "apparel",
        "Warm zip-up hoodie with embroidered logo",
        50,
        "S",
        "Gray",
        20,
        '["cold", "outdoor"]',
        15.00,
        0.70,
        "SUP-APPAREL-003",
    ),
    (
        "HOODIE-GRY-M",
        "CloudCo Zip Hoodie",
        "apparel",
        "Warm zip-up hoodie with embroidered logo",
        50,
        "M",
        "Gray",
        30,
        '["cold", "outdoor"]',
        15.00,
        0.70,
        "SUP-APPAREL-003",
    ),
    (
        "HOODIE-GRY-L",
        "CloudCo Zip Hoodie",
        "apparel",
        "Warm zip-up hoodie with embroidered logo",
        50,
        "L",
        "Gray",
        25,
        '["cold", "outdoor"]',
        15.50,
        0.69,
        "SUP-APPAREL-003",
    ),
    (
        "HOODIE-GRY-XL",
        "CloudCo Zip Hoodie",
        "apparel",
        "Warm zip-up hoodie with embroidered logo",
        50,
        "XL",
        "Gray",
        15,
        '["cold", "outdoor"]',
        16.00,
        0.68,
        "SUP-APPAREL-003",
    ),
    (
        "HOODIE-NVY-M",
        "CloudCo Pullover",
        "apparel",
        "Cozy navy pullover hoodie",
        45,
        "M",
        "Navy",
        20,
        '["cold", "outdoor"]',
        13.50,
        0.70,
        "SUP-APPAREL-003",
    ),
    (
        "HOODIE-NVY-L",
        "CloudCo Pullover",
        "apparel",
        "Cozy navy pullover hoodie",
        45,
        "L",
        "Navy",
        25,
        '["cold", "outdoor"]',
        14.00,
        0.69,
        "SUP-APPAREL-003",
    ),
    # Hats - cost around $3-5, 75-85% margin
    (
        "HAT-SNAP-BLK",
        "CloudCo Snapback",
        "accessories",
        "Adjustable snapback cap with embroidered logo",
        20,
        None,
        "Black",
        100,
        '["sunny", "outdoor"]',
        4.00,
        0.80,
        "SUP-ACC-001",
    ),
    (
        "HAT-SNAP-NVY",
        "CloudCo Snapback",
        "accessories",
        "Adjustable snapback cap with embroidered logo",
        20,
        None,
        "Navy",
        80,
        '["sunny", "outdoor"]',
        4.00,
        0.80,
        "SUP-ACC-001",
    ),
    (
        "HAT-BEANIE-GRY",
        "CloudCo Beanie",
        "accessories",
        "Warm knit beanie for cold days",
        15,
        None,
        "Gray",
        80,
        '["cold", "outdoor"]',
        3.00,
        0.80,
        "SUP-ACC-001",
    ),
    (
        "HAT-BEANIE-BLK",
        "CloudCo Beanie",
        "accessories",
        "Warm knit beanie for cold days",
        15,
        None,
        "Black",
        70,
        '["cold", "outdoor"]',
        3.00,
        0.80,
        "SUP-ACC-001",
    ),
    # Drinkware - cost around $4-8, 75% margin
    (
        "BOTTLE-BLU-20",
        "CloudCo Water Bottle",
        "drinkware",
        "20oz insulated stainless steel bottle",
        20,
        None,
        "Blue",
        150,
        '["hot", "outdoor"]',
        5.00,
        0.75,
        "SUP-DRINK-001",
    ),
    (
        "BOTTLE-BLK-20",
        "CloudCo Water Bottle",
        "drinkware",
        "20oz insulated stainless steel bottle",
        20,
        None,
        "Black",
        120,
        '["hot", "outdoor"]',
        5.00,
        0.75,
        "SUP-DRINK-001",
    ),
    (
        "MUG-WHT-12",
        "CloudCo Coffee Mug",
        "drinkware",
        "12oz ceramic mug with logo",
        15,
        None,
        "White",
        200,
        '["cold", "indoor"]',
        3.50,
        0.77,
        "SUP-DRINK-002",
    ),
    (
        "MUG-BLK-12",
        "CloudCo Coffee Mug",
        "drinkware",
        "12oz ceramic mug - dark mode edition",
        15,
        None,
        "Black",
        150,
        '["cold", "indoor"]',
        3.75,
        0.75,
        "SUP-DRINK-002",
    ),
    (
        "TUMBLER-BLK-16",
        "CloudCo Travel Tumbler",
        "drinkware",
        "16oz vacuum-insulated tumbler",
        25,
        None,
        "Black",
        60,
        '["any"]',
        7.50,
        0.70,
        "SUP-DRINK-001",
    ),
    # Stickers - very low cost, 90%+ margin
    (
        "STICKER-LOGO-5PK",
        "Logo Sticker Pack",
        "stickers",
        "5 vinyl CloudCo logo stickers",
        5,
        None,
        None,
        500,
        '["any"]',
        0.50,
        0.90,
        "SUP-PRINT-001",
    ),
    (
        "STICKER-DEV-10PK",
        "Developer Sticker Pack",
        "stickers",
        "10 coding-themed stickers",
        10,
        None,
        None,
        300,
        '["any"]',
        0.75,
        0.93,
        "SUP-PRINT-001",
    ),
    (
        "STICKER-HOLO-3PK",
        "Holographic Sticker Pack",
        "stickers",
        "3 premium holographic stickers",
        8,
        None,
        None,
        150,
        '["any"]',
        1.20,
        0.85,
        "SUP-PRINT-002",
    ),
    # Other Accessories
    (
        "BACKPACK-BLK",
        "CloudCo Laptop Backpack",
        "accessories",
        "15-inch laptop backpack with padded compartment",
        75,
        None,
        "Black",
        25,
        '["any", "outdoor"]',
        22.50,
        0.70,
        "SUP-ACC-002",
    ),
    (
        "LANYARD-BLU",
        "CloudCo Lanyard",
        "accessories",
        "Badge lanyard with detachable clip",
        5,
        None,
        "Blue",
        400,
        '["any"]',
        0.75,
        0.85,
        "SUP-ACC-003",
    ),
    (
        "MOUSEPAD-BLK",
        "CloudCo Desk Pad",
        "accessories",
        "Large extended mousepad with logo",
        15,
        None,
        "Black",
        100,
        '["any", "indoor"]',
        4.50,
        0.70,
        "SUP-ACC-004",
    ),
    (
        "SOCKS-LOGO-M",
        "CloudCo Logo Socks",
        "accessories",
        "Comfy crew socks with CloudCo pattern",
        10,
        "M",
        "Blue",
        150,
        '["any"]',
        2.00,
        0.80,
        "SUP-APPAREL-004",
    ),
]


# Orders - dates relative to now
def get_orders():
    now = datetime.now()
    return [
        # Alice's orders
        (
            "ORD-2024-001",
            "emp_001",
            "delivered",
            45,
            "123 Tech Lane, San Francisco, CA 94105",
            "FX123456789",
            "fedex",
            now - timedelta(days=14),
        ),
        (
            "ORD-2024-005",
            "emp_001",
            "shipped",
            70,
            "123 Tech Lane, San Francisco, CA 94105",
            "1Z999AA10123456784",
            "ups",
            now - timedelta(days=3),
        ),
        (
            "ORD-2024-010",
            "emp_001",
            "pending",
            25,
            "123 Tech Lane, San Francisco, CA 94105",
            None,
            None,
            now - timedelta(hours=6),
        ),
        # Bob's orders
        (
            "ORD-2024-002",
            "emp_002",
            "delivered",
            30,
            "456 Marketing Ave, New York, NY 10001",
            "FX987654321",
            "fedex",
            now - timedelta(days=21),
        ),
        (
            "ORD-2024-007",
            "emp_002",
            "confirmed",
            50,
            "456 Marketing Ave, New York, NY 10001",
            None,
            None,
            now - timedelta(days=1),
        ),
        # Charlie's orders
        (
            "ORD-2024-003",
            "emp_003",
            "shipped",
            55,
            "789 Sales Blvd, Chicago, IL 60601",
            "1Z999BB20123456785",
            "ups",
            now - timedelta(days=5),
        ),
        # Diana's orders
        (
            "ORD-2024-004",
            "emp_004",
            "delivered",
            15,
            "321 HR Street, Austin, TX 78701",
            "FX111222333",
            "fedex",
            now - timedelta(days=30),
        ),
        (
            "ORD-2024-008",
            "emp_004",
            "delivered",
            95,
            "321 HR Street, Austin, TX 78701",
            "FX444555666",
            "fedex",
            now - timedelta(days=10),
        ),
        # Eve's orders
        (
            "ORD-2024-006",
            "emp_005",
            "pending",
            40,
            "555 Finance Way, Seattle, WA 98101",
            None,
            None,
            now - timedelta(days=2),
        ),
        (
            "ORD-2024-009",
            "emp_005",
            "shipped",
            25,
            "555 Finance Way, Seattle, WA 98101",
            "1Z999CC30123456786",
            "ups",
            now - timedelta(days=4),
        ),
    ]


# Order items
ORDER_ITEMS = [
    # Alice's first order (delivered) - t-shirt + hat
    ("ORD-2024-001", "TSHIRT-BLU-M", 1, 25),
    ("ORD-2024-001", "HAT-SNAP-BLK", 1, 20),
    # Alice's second order (shipped) - hoodie + water bottle
    ("ORD-2024-005", "HOODIE-GRY-M", 1, 50),
    ("ORD-2024-005", "BOTTLE-BLU-20", 1, 20),
    # Alice's third order (pending) - t-shirt
    ("ORD-2024-010", "TSHIRT-BLK-M", 1, 25),
    # Bob's first order (delivered) - stickers + mug
    ("ORD-2024-002", "STICKER-LOGO-5PK", 2, 5),
    ("ORD-2024-002", "MUG-WHT-12", 1, 15),
    ("ORD-2024-002", "LANYARD-BLU", 1, 5),
    # Bob's second order (confirmed) - hoodie
    ("ORD-2024-007", "HOODIE-NVY-M", 1, 45),
    ("ORD-2024-007", "STICKER-DEV-10PK", 1, 5),
    # Charlie's order (shipped) - backpack
    ("ORD-2024-003", "BACKPACK-BLK", 1, 75),
    # Diana's first order (delivered) - lanyards
    ("ORD-2024-004", "LANYARD-BLU", 3, 5),
    # Diana's second order (delivered) - hoodie + accessories
    ("ORD-2024-008", "HOODIE-GRY-L", 1, 50),
    ("ORD-2024-008", "HAT-BEANIE-GRY", 1, 15),
    ("ORD-2024-008", "MUG-BLK-12", 2, 15),
    # Eve's first order (pending) - tumbler + mousepad
    ("ORD-2024-006", "TUMBLER-BLK-16", 1, 25),
    ("ORD-2024-006", "MOUSEPAD-BLK", 1, 15),
    # Eve's second order (shipped) - t-shirt
    ("ORD-2024-009", "TSHIRT-WHT-M", 1, 25),
]


def seed_database():
    """Create and seed the database."""
    # Ensure data directory exists
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Remove existing database
    if DB_PATH.exists():
        DB_PATH.unlink()
        print(f"Removed existing database: {DB_PATH}")

    # Create connection
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create schema
    cursor.executescript(SCHEMA)
    print("Created database schema")

    # Insert users
    cursor.executemany(
        "INSERT INTO users (user_id, email, username, password_hash, full_name, department, office_location, swag_points, salary, ssn_last_four, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        USERS,
    )
    print(f"Inserted {len(USERS)} users")

    # Insert products (including sensitive cost data for API3 vulnerability)
    cursor.executemany(
        "INSERT INTO products (product_id, name, category, description, price_points, size, color, stock_quantity, weather_tags, cost_price, profit_margin, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        PRODUCTS,
    )
    print(f"Inserted {len(PRODUCTS)} products")

    # Insert orders
    orders = get_orders()
    cursor.executemany(
        "INSERT INTO orders (order_id, user_id, status, total_points, shipping_address, tracking_number, carrier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        orders,
    )
    print(f"Inserted {len(orders)} orders")

    # Insert order items
    cursor.executemany(
        "INSERT INTO order_items (order_id, product_id, quantity, points_each) VALUES (?, ?, ?, ?)",
        ORDER_ITEMS,
    )
    print(f"Inserted {len(ORDER_ITEMS)} order items")

    # Commit and close
    conn.commit()
    conn.close()

    print(f"\nDatabase created successfully at: {DB_PATH}")
    print("\nDemo accounts:")
    print("  alice (emp_001) - 3 orders")
    print("  bob (emp_002) - 2 orders")
    print("  charlie (emp_003) - 1 order")
    print("  diana (emp_004) - 2 orders")
    print("  eve (emp_005) - 2 orders")


if __name__ == "__main__":
    seed_database()
