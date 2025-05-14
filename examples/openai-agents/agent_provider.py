"""Airline customer service agent implementation using OpenAI Agents SDK.

This module demonstrates how to build a multi-agent system with the OpenAI Agents SDK
that can be evaluated by promptfoo. The example implements an airline customer
service system with three specialized agents:

1. Triage Agent: Routes customer inquiries to specialized agents
2. FAQ Agent: Answers policy questions about baggage, food, etc.
3. Seat Booking Agent: Handles seat change requests

The agents use custom tools to look up information and update bookings, while
maintaining context across agent handoffs. This example showcases:

- Agent handoffs between specialized services
- Context persistence across conversations
- Custom tool implementation with the Agents SDK
- Conversation tracing
- Token usage tracking
- Integration with promptfoo for evaluation

For a complete run through, see the README.md in this directory.

Typical usage:
    import asyncio
    from agent_provider import call_api

    result = call_api(
        "What's your baggage policy?",
        {"config": {"agent_type": "triage"}},
        {"vars": {}}
    )
    print(result["output"])
"""

import random
import uuid
from typing import Any, Dict, List, Optional

# Import OpenAI Agents SDK
from agents import (
    Agent,
    HandoffOutputItem,
    ItemHelpers,
    MessageOutputItem,
    RunContextWrapper,
    Runner,
    ToolCallOutputItem,
    TResponseInputItem,
    function_tool,
    handoff,
    trace,
)
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX
from pydantic import BaseModel

### CONTEXT


class AirlineAgentContext(BaseModel):
    """Shared context maintained across agent handoffs.

    This context is persisted throughout the conversation and passed
    between agents during handoffs, allowing information to be shared.
    """

    passenger_name: Optional[str] = None
    confirmation_number: Optional[str] = None
    seat_number: Optional[str] = None
    flight_number: Optional[str] = None


### TOOLS


@function_tool(
    name_override="faq_lookup_tool",
    description_override="Lookup frequently asked questions.",
)
async def faq_lookup_tool(question: str) -> str:
    """Look up answers to frequently asked questions about the airline.

    Args:
        question: The customer's question about airline policies or services

    Returns:
        A string containing the answer to the question, if found
    """
    if (
        "bag" in question.lower()
        or "baggage" in question.lower()
        or "luggage" in question.lower()
    ):
        return (
            "You are allowed to bring one bag on the plane. "
            "It must be under 50 pounds and 22 inches x 14 inches x 9 inches."
        )
    elif (
        "seat" in question.lower()
        or "plane" in question.lower()
        or "seating" in question.lower()
    ):
        return (
            "There are 120 seats on the plane. "
            "There are 22 business class seats and 98 economy seats. "
            "Exit rows are rows 4 and 16. "
            "Rows 5-8 are Economy Plus, with extra legroom. "
        )
    elif "wifi" in question.lower() or "internet" in question.lower():
        return "We have free wifi on the plane, join Airline-Wifi"
    elif (
        "food" in question.lower()
        or "meal" in question.lower()
        or "drink" in question.lower()
    ):
        return (
            "We offer complimentary snacks and beverages on all flights. "
            "Business class passengers receive a full meal service on flights over 3 hours."
        )
    elif "cancel" in question.lower() or "refund" in question.lower():
        return (
            "Cancellations can be made up to 24 hours before departure for a full refund. "
            "After that, a fee may apply depending on your ticket type."
        )
    return "I'm sorry, I don't know the answer to that question."


@function_tool
async def update_seat(
    context: RunContextWrapper[AirlineAgentContext],
    confirmation_number: str,
    new_seat: str,
) -> str:
    """Update the seat for a given confirmation number.

    Args:
        context: The shared context wrapper containing customer information
        confirmation_number: The confirmation number for the flight
        new_seat: The new seat to update to

    Returns:
        A confirmation message with the updated seat information
    """
    # Update the context based on the customer's input
    context.context.confirmation_number = confirmation_number
    context.context.seat_number = new_seat

    # Generate flight number if it doesn't exist
    if context.context.flight_number is None:
        context.context.flight_number = f"FLT-{random.randint(100, 999)}"

    return f"Updated seat to {new_seat} for confirmation number {confirmation_number} on flight {context.context.flight_number}"


### HOOKS


async def on_seat_booking_handoff(
    context: RunContextWrapper[AirlineAgentContext],
) -> None:
    """Function called when handing off to the seat booking agent.

    This hook is automatically executed when the triage agent hands off
    to the seat booking agent, allowing for context preparation.

    Args:
        context: The shared context wrapper containing customer information
    """
    flight_number = f"FLT-{random.randint(100, 999)}"
    context.context.flight_number = flight_number


### AGENTS

# FAQ Agent specializes in answering policy questions
faq_agent = Agent[AirlineAgentContext](
    name="FAQ Agent",
    handoff_description="A helpful agent that can answer questions about the airline.",
    instructions=f"""{RECOMMENDED_PROMPT_PREFIX}
    You are an FAQ agent. If you are speaking to a customer, you probably were transferred from the triage agent.
    Use the following routine to support the customer.
    # Routine
    1. Identify the last question asked by the customer.
    2. Use the faq lookup tool to answer the question. Do not rely on your own knowledge.
    3. If you cannot answer the question, transfer back to the triage agent.""",
    tools=[faq_lookup_tool],
)

# Seat Booking Agent specializes in handling seat changes
seat_booking_agent = Agent[AirlineAgentContext](
    name="Seat Booking Agent",
    handoff_description="A helpful agent that can update a seat on a flight.",
    instructions=f"""{RECOMMENDED_PROMPT_PREFIX}
    You are a seat booking agent. If you are speaking to a customer, you probably were transferred from the triage agent.
    Use the following routine to support the customer.
    # Routine
    1. Ask for their confirmation number.
    2. Ask the customer what their desired seat number is.
    3. Use the update seat tool to update the seat on the flight.
    If the customer asks a question that is not related to the routine, transfer back to the triage agent. """,
    tools=[update_seat],
)

# Triage Agent is the main entry point that routes to specialized agents
triage_agent = Agent[AirlineAgentContext](
    name="Triage Agent",
    handoff_description="A triage agent that can delegate a customer's request to the appropriate agent.",
    instructions=(
        f"{RECOMMENDED_PROMPT_PREFIX} "
        "You are a helpful triaging agent. You can use your tools to delegate questions to other appropriate agents."
    ),
    handoffs=[
        faq_agent,
        handoff(agent=seat_booking_agent, on_handoff=on_seat_booking_handoff),
    ],
)

# Set up handoffs between agents
faq_agent.handoffs.append(triage_agent)
seat_booking_agent.handoffs.append(triage_agent)


### PROMPTFOO INTEGRATION


async def run_agent(prompt: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """Run an agent with the provided prompt and options.

    This function initializes the appropriate agent based on configuration,
    runs it with the provided prompt, and formats the result for promptfoo.

    Args:
        prompt: The user's input message
        options: Configuration options including agent_type

    Returns:
        A dictionary containing the agent's output, token usage, context, and metadata
    """
    config = options.get("config", {})
    agent_type = config.get("agent_type", "triage")

    # Setup context
    context = AirlineAgentContext()
    if "passenger_name" in config:
        context.passenger_name = config["passenger_name"]
    if "confirmation_number" in config:
        context.confirmation_number = config["confirmation_number"]

    # Select the appropriate agent
    if agent_type == "faq":
        current_agent = faq_agent
    elif agent_type == "seat_booking":
        current_agent = seat_booking_agent
        # Generate a flight number if needed
        if context.flight_number is None:
            context.flight_number = f"FLT-{random.randint(100, 999)}"
    else:  # Default to triage
        current_agent = triage_agent

    # Create conversation history
    input_items: List[TResponseInputItem] = [{"content": prompt, "role": "user"}]

    # Generate a conversation ID for tracing
    conversation_id = config.get("conversation_id", uuid.uuid4().hex[:16])

    try:
        # Run the agent with tracing
        with trace("Customer service", group_id=conversation_id):
            result = await Runner.run(current_agent, input_items, context=context)

            # Process and collect outputs
            output = ""
            for new_item in result.new_items:
                agent_name = new_item.agent.name
                if isinstance(new_item, MessageOutputItem):
                    message = ItemHelpers.text_message_output(new_item)
                    output += f"{agent_name}: {message}\n"
                elif isinstance(new_item, HandoffOutputItem):
                    handoff_text = f"Handed off from {new_item.source_agent.name} to {new_item.target_agent.name}\n"
                    output += handoff_text
                elif isinstance(new_item, ToolCallOutputItem):
                    tool_text = f"Tool result: {new_item.output}\n"
                    output += tool_text

            # Extract token usage information from raw responses
            token_usage = {
                "total": 0,
                "prompt": 0,
                "completion": 0,
            }

            # Accumulate token usage from all API responses
            if hasattr(result, "raw_responses") and result.raw_responses:
                for resp in result.raw_responses:
                    if hasattr(resp, "usage"):
                        token_usage["total"] += getattr(resp.usage, "total_tokens", 0)
                        token_usage["prompt"] += getattr(resp.usage, "prompt_tokens", 0)
                        token_usage["completion"] += getattr(
                            resp.usage, "completion_tokens", 0
                        )

            # Use minimal fallback values if no usage info is available
            if token_usage["total"] == 0:
                token_usage = {"total": 1, "prompt": 1, "completion": 0}

            # Return the result following promptfoo's ProviderResponse interface
            return {
                "output": output.strip(),
                "tokenUsage": token_usage,
                "context": context.dict(),
                "final_agent": result.last_agent.name,
            }
    except Exception as e:
        return {"error": str(e), "output": f"Error: {str(e)}"}


async def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Main entry point for promptfoo to call the airline agent system.

    This async function is called by promptfoo to interact with the agent system.
    It handles transferring variables from promptfoo context to agent options
    and directly awaits the agent run operation.

    Args:
        prompt: The prompt to send to the agent
        options: Configuration options for the agent
        context: Context information from promptfoo

    Returns:
        A dictionary containing the output and any additional information
    """
    try:
        # Transfer variables from promptfoo to agent options
        if "passenger_name" in context.get("vars", {}):
            if "config" not in options:
                options["config"] = {}
            options["config"]["passenger_name"] = context["vars"]["passenger_name"]

        if "confirmation_number" in context.get("vars", {}):
            if "config" not in options:
                options["config"] = {}
            options["config"]["confirmation_number"] = context["vars"][
                "confirmation_number"
            ]

        # Create conversation ID for continuing conversations
        if "conversation_id" in context.get("vars", {}):
            if "config" not in options:
                options["config"] = {}
            options["config"]["conversation_id"] = context["vars"]["conversation_id"]

        result = await run_agent(prompt, options)
        return result
    except Exception as e:
        return {"error": str(e), "output": f"Error: {str(e)}"}
