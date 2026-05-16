"""
Products Router - Product catalog and orders API
"""

import sqlite3
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import UserContext, get_current_user
from ..config import SWAG_DB_PATH

router = APIRouter(prefix="/api", tags=["products"])


def get_db():
    """Get database connection."""
    return sqlite3.connect(SWAG_DB_PATH)


class Product(BaseModel):
    """Product model."""

    product_id: str
    name: str
    category: str
    description: Optional[str] = None
    price_points: int
    size: Optional[str] = None
    color: Optional[str] = None
    stock_quantity: int
    in_stock: bool


class OrderItem(BaseModel):
    """Order item model."""

    product_id: str
    name: str
    quantity: int
    points_each: int
    total_points: int


class Order(BaseModel):
    """Order model."""

    order_id: str
    status: str
    total_points: int
    shipping_address: Optional[str] = None
    tracking_number: Optional[str] = None
    carrier: Optional[str] = None
    created_at: str
    items: List[OrderItem]


@router.get("/products")
async def list_products(
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in name/description"),
    in_stock: Optional[bool] = Query(None, description="Filter by availability"),
):
    """
    List all products with optional filters.

    Categories: apparel, accessories, drinkware, stickers
    """
    conn = get_db()
    cursor = conn.cursor()

    try:
        query = """
            SELECT product_id, name, category, description, price_points,
                   size, color, stock_quantity
            FROM products
            WHERE is_active = 1
        """
        params = []

        if category:
            query += " AND category = ?"
            params.append(category)

        if search:
            query += " AND (name LIKE ? OR description LIKE ?)"
            params.extend([f"%{search}%", f"%{search}%"])

        if in_stock is not None:
            if in_stock:
                query += " AND stock_quantity > 0"
            else:
                query += " AND stock_quantity = 0"

        query += " ORDER BY category, name"

        cursor.execute(query, params)
        rows = cursor.fetchall()

        products = []
        for row in rows:
            products.append(
                {
                    "product_id": row[0],
                    "name": row[1],
                    "category": row[2],
                    "description": row[3],
                    "price_points": row[4],
                    "size": row[5],
                    "color": row[6],
                    "stock_quantity": row[7],
                    "in_stock": row[7] > 0,
                }
            )

        return {"products": products, "count": len(products)}

    finally:
        conn.close()


@router.get("/products/categories")
async def list_categories():
    """List all product categories with counts."""
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT category, COUNT(*) as count
            FROM products
            WHERE is_active = 1
            GROUP BY category
            ORDER BY category
        """)

        categories = [{"name": row[0], "count": row[1]} for row in cursor.fetchall()]
        return {"categories": categories}

    finally:
        conn.close()


@router.get("/products/{product_id}")
async def get_product(product_id: str):
    """Get a single product by ID."""
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            SELECT product_id, name, category, description, price_points,
                   size, color, stock_quantity
            FROM products
            WHERE product_id = ? AND is_active = 1
        """,
            (product_id,),
        )

        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Product not found")

        return {
            "product_id": row[0],
            "name": row[1],
            "category": row[2],
            "description": row[3],
            "price_points": row[4],
            "size": row[5],
            "color": row[6],
            "stock_quantity": row[7],
            "in_stock": row[7] > 0,
        }

    finally:
        conn.close()


@router.get("/orders")
async def list_orders(user: UserContext = Depends(get_current_user)):
    """
    List current user's orders.

    Requires authentication.
    """
    conn = get_db()
    cursor = conn.cursor()

    try:
        # Get orders
        cursor.execute(
            """
            SELECT order_id, status, total_points, shipping_address,
                   tracking_number, carrier, created_at
            FROM orders
            WHERE user_id = ?
            ORDER BY created_at DESC
        """,
            (user.user_id,),
        )

        orders = []
        for row in cursor.fetchall():
            order_id = row[0]

            # Get order items
            cursor.execute(
                """
                SELECT oi.product_id, p.name, oi.quantity, oi.points_each
                FROM order_items oi
                JOIN products p ON oi.product_id = p.product_id
                WHERE oi.order_id = ?
            """,
                (order_id,),
            )

            items = []
            for item_row in cursor.fetchall():
                items.append(
                    {
                        "product_id": item_row[0],
                        "name": item_row[1],
                        "quantity": item_row[2],
                        "points_each": item_row[3],
                        "total_points": item_row[2] * item_row[3],
                    }
                )

            orders.append(
                {
                    "order_id": order_id,
                    "status": row[1],
                    "total_points": row[2],
                    "shipping_address": row[3],
                    "tracking_number": row[4],
                    "carrier": row[5],
                    "created_at": row[6],
                    "items": items,
                }
            )

        return {"orders": orders, "count": len(orders)}

    finally:
        conn.close()


@router.get("/orders/{order_id}")
async def get_order(order_id: str, user: UserContext = Depends(get_current_user)):
    """
    Get a specific order by ID.

    Only returns orders belonging to the authenticated user.
    """
    conn = get_db()
    cursor = conn.cursor()

    try:
        # Get order (with user_id check for security)
        cursor.execute(
            """
            SELECT order_id, status, total_points, shipping_address,
                   tracking_number, carrier, created_at
            FROM orders
            WHERE order_id = ? AND user_id = ?
        """,
            (order_id, user.user_id),
        )

        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")

        # Get order items
        cursor.execute(
            """
            SELECT oi.product_id, p.name, oi.quantity, oi.points_each
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            WHERE oi.order_id = ?
        """,
            (order_id,),
        )

        items = []
        for item_row in cursor.fetchall():
            items.append(
                {
                    "product_id": item_row[0],
                    "name": item_row[1],
                    "quantity": item_row[2],
                    "points_each": item_row[3],
                    "total_points": item_row[2] * item_row[3],
                }
            )

        return {
            "order_id": row[0],
            "status": row[1],
            "total_points": row[2],
            "shipping_address": row[3],
            "tracking_number": row[4],
            "carrier": row[5],
            "created_at": row[6],
            "items": items,
        }

    finally:
        conn.close()


@router.get("/user/points")
async def get_user_points(user: UserContext = Depends(get_current_user)):
    """Get current user's swag points balance."""
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT swag_points FROM users WHERE user_id = ?", (user.user_id,)
        )
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        return {"user_id": user.user_id, "swag_points": row[0]}

    finally:
        conn.close()
