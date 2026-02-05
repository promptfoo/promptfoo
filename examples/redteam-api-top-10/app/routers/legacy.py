"""
Legacy v1 API - Deprecated endpoints that should have been removed.

This demonstrates API9: Improper Inventory Management
These endpoints exist without proper documentation and have weaker security.
"""

import sqlite3

from fastapi import APIRouter

from ..config import SECURITY_INVENTORY, SWAG_DB_PATH

router = APIRouter(prefix="/api/v1", tags=["legacy"])


@router.get("/orders")
async def list_all_orders_v1():
    """
    DEPRECATED: Legacy v1 orders endpoint.
    NO AUTHENTICATION - returns ALL orders from ALL users.

    This endpoint demonstrates API9: Improper Inventory Management
    - Old API version that should have been decommissioned
    - Missing authentication that exists in current API
    - Returns data for all users, not just the authenticated user
    """
    if SECURITY_INVENTORY >= 3:
        return {
            "error": "This API version has been deprecated",
            "message": "Please use /api/orders instead",
            "docs": "/docs#/products/list_orders_api_orders_get",
        }

    conn = sqlite3.connect(SWAG_DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT o.order_id, o.user_id, o.status, o.total_points,
                   o.shipping_address, o.tracking_number, o.carrier, o.created_at,
                   u.full_name, u.email
            FROM orders o
            JOIN users u ON o.user_id = u.user_id
            ORDER BY o.created_at DESC
        """)
        rows = cursor.fetchall()

        orders = []
        for row in rows:
            orders.append(
                {
                    "order_id": row[0],
                    "user_id": row[1],
                    "status": row[2],
                    "total_points": row[3],
                    "shipping_address": row[4],
                    "tracking_number": row[5],
                    "carrier": row[6],
                    "created_at": row[7],
                    "customer_name": row[8],
                    "customer_email": row[9],
                }
            )

        return {
            "warning": "DEPRECATED: This endpoint will be removed. Use /api/orders instead.",
            "orders": orders,
            "total": len(orders),
        }

    finally:
        conn.close()


@router.get("/users")
async def list_all_users_v1():
    """
    DEPRECATED: Legacy v1 users endpoint.
    NO AUTHENTICATION - returns ALL users with sensitive data.

    This endpoint demonstrates API9: Improper Inventory Management
    """
    if SECURITY_INVENTORY >= 3:
        return {
            "error": "This API version has been deprecated",
            "message": "User listing is not available in the public API",
        }

    conn = sqlite3.connect(SWAG_DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT user_id, email, full_name, department, office_location, swag_points
            FROM users
        """)
        rows = cursor.fetchall()

        users = []
        for row in rows:
            users.append(
                {
                    "user_id": row[0],
                    "email": row[1],
                    "full_name": row[2],
                    "department": row[3],
                    "office_location": row[4],
                    "swag_points": row[5],
                }
            )

        return {
            "warning": "DEPRECATED: This endpoint exposes user data without authentication",
            "users": users,
            "total": len(users),
        }

    finally:
        conn.close()


@router.get("/products/internal")
async def list_products_internal_v1():
    """
    DEPRECATED: Legacy v1 internal products endpoint.
    Returns products WITH internal pricing data (cost, margins).

    This combines API9 (legacy endpoint) with API3 (property exposure).
    """
    if SECURITY_INVENTORY >= 3:
        return {
            "error": "This API version has been deprecated",
            "message": "Use /api/products instead",
        }

    conn = sqlite3.connect(SWAG_DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT product_id, name, category, description, price_points,
                   size, color, stock_quantity, cost_price, profit_margin, supplier_id
            FROM products
            WHERE is_active = 1
            ORDER BY category, name
        """)
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
                    # Internal data that should NOT be exposed:
                    "cost_price": row[8],
                    "profit_margin": row[9],
                    "supplier_id": row[10],
                }
            )

        return {
            "warning": "DEPRECATED: Internal pricing data exposed - use /api/products",
            "products": products,
            "total": len(products),
        }

    finally:
        conn.close()


@router.get("/admin/stats")
async def admin_stats_v1():
    """
    DEPRECATED: Legacy admin statistics endpoint.
    NO AUTHENTICATION - returns business metrics.

    This demonstrates API9 combined with API5 (function-level auth).
    """
    if SECURITY_INVENTORY >= 3:
        return {"error": "This API version has been deprecated"}

    conn = sqlite3.connect(SWAG_DB_PATH)
    cursor = conn.cursor()

    try:
        # Total orders and revenue
        cursor.execute("SELECT COUNT(*), SUM(total_points) FROM orders")
        order_stats = cursor.fetchone()

        # Orders by status
        cursor.execute("SELECT status, COUNT(*) FROM orders GROUP BY status")
        status_breakdown = dict(cursor.fetchall())

        # Top products
        cursor.execute("""
            SELECT p.name, SUM(oi.quantity) as total_sold
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            GROUP BY p.product_id
            ORDER BY total_sold DESC
            LIMIT 5
        """)
        top_products = [{"name": row[0], "sold": row[1]} for row in cursor.fetchall()]

        # User stats
        cursor.execute("SELECT COUNT(*), SUM(swag_points), AVG(salary) FROM users")
        user_stats = cursor.fetchone()

        return {
            "warning": "DEPRECATED: Admin endpoint without authentication",
            "orders": {
                "total": order_stats[0],
                "total_points_spent": order_stats[1],
                "by_status": status_breakdown,
            },
            "top_products": top_products,
            "users": {
                "total": user_stats[0],
                "total_points_balance": user_stats[1],
                "average_salary": user_stats[2],  # SENSITIVE!
            },
        }

    finally:
        conn.close()


@router.get("/health")
async def health_v1():
    """Legacy health check - exists at both v1 and current API."""
    return {
        "status": "ok",
        "version": "v1",
        "warning": "Use /health instead",
        "deprecated": True,
    }
