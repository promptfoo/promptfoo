"""
Example Support Agent - Exported from Agent Builder

This is an example of what you'd get when exporting an agent
from OpenAI Agent Builder. Replace this with your own agent export.
"""

from agents import Agent
from agents.tool import function_tool
from pydantic import Field


@function_tool
def lookup_order(order_id: str = Field(description="The order ID to look up")) -> dict:
    """
    Look up order status by order ID.

    Args:
        order_id: The order ID (e.g., "#12345")

    Returns:
        Order details including status, items, and tracking
    """
    # This is a mock implementation
    # In production, this would query your order database/API
    return {
        "order_id": order_id,
        "status": "shipped",
        "items": [
            {"name": "Widget Pro", "quantity": 2, "price": 29.99},
            {"name": "Gadget Mini", "quantity": 1, "price": 14.99},
        ],
        "total": 74.97,
        "tracking_number": "TRACK123456789",
        "estimated_delivery": "2025-10-30",
        "shipping_address": "123 Main St, Anytown, USA",
    }


@function_tool
def check_product_info(sku: str = Field(description="Product SKU")) -> dict:
    """
    Get product information by SKU.

    Args:
        sku: Product SKU code

    Returns:
        Product details including specs, pricing, and availability
    """
    # Mock implementation
    return {
        "sku": sku,
        "name": "Super Widget Pro Max",
        "price": 149.99,
        "in_stock": True,
        "quantity_available": 42,
        "specs": {
            "weight": "2.5 lbs",
            "dimensions": "10 x 8 x 4 inches",
            "color": "Midnight Black",
            "warranty": "2 years",
        },
        "features": [
            "Advanced AI processing",
            "Waterproof design",
            "Long-lasting battery",
            "Wireless connectivity",
        ],
    }


@function_tool
def process_refund(
    order_id: str = Field(description="Order ID"),
    reason: str = Field(description="Reason for refund"),
) -> dict:
    """
    Process a refund request.

    Args:
        order_id: The order ID to refund
        reason: Customer's reason for requesting refund

    Returns:
        Refund processing status
    """
    # Mock implementation
    return {
        "refund_id": f"REF-{order_id}-001",
        "order_id": order_id,
        "status": "approved",
        "amount": 74.97,
        "reason": reason,
        "expected_credit_date": "2025-11-05",
        "message": "Your refund has been approved and will be credited to your original payment method within 5-7 business days.",
    }


@function_tool
def escalate_to_manager(
    reason: str = Field(description="Reason for escalation"),
    customer_issue: str = Field(description="Description of the customer's issue"),
) -> dict:
    """
    Escalate issue to a human manager.

    Args:
        reason: Why this needs manager attention
        customer_issue: Full description of the problem

    Returns:
        Escalation confirmation
    """
    # Mock implementation
    return {
        "escalation_id": "ESC-12345",
        "status": "escalated",
        "assigned_to": "Manager Sarah Johnson",
        "expected_response_time": "within 2 hours",
        "message": "This issue has been escalated to our management team. A manager will reach out to you shortly.",
    }


# Define the support agent
# This is what you'd export from Agent Builder
agent = Agent(
    name="Customer Support Agent",
    model="gpt-5-mini",
    instructions="""You are a friendly and professional customer support agent.

Your responsibilities:
- Help customers with order inquiries, product questions, and account issues
- Use the available tools to look up real information
- Process refunds when appropriate
- Escalate complex issues to human managers

Guidelines:
- Always be polite, patient, and empathetic
- Ask clarifying questions when needed
- Use tools to provide accurate information
- For refunds or complex issues, gather all necessary details first
- When escalating, summarize the issue clearly
- End responses with a question to continue helping the customer

Available tools:
- lookup_order: Check order status and details
- check_product_info: Get product specifications and availability
- process_refund: Initiate refund requests
- escalate_to_manager: Transfer to human support for complex issues
""",
    tools=[lookup_order, check_product_info, process_refund, escalate_to_manager],
)


# Export the agent for use in the backend
__all__ = ["agent"]
