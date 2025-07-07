"""
Multi-agent system using OpenAI Agents SDK (Swarm)
Demonstrates agent handoffs and specialized roles
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

from swarm import Swarm, Agent
from tracing_utils import create_traced_provider, initialize_tracing

# Initialize tracer
tracer = initialize_tracing("openai-multi-agent")

# Define specialized agents
travel_agent = Agent(
    name="Travel Planner",
    instructions="""You are a travel planning specialist. You help with:
    - Flight and hotel bookings
    - Itinerary planning
    - Local recommendations
    - Travel logistics
    When users ask about language learning or cultural information, transfer to the Culture Expert.""",
)

culture_agent = Agent(
    name="Culture Expert", 
    instructions="""You are a cultural and language expert. You help with:
    - Language learning and phrases
    - Cultural etiquette
    - Local customs
    - Historical context
    When users ask about travel logistics, transfer to the Travel Planner.""",
)

technical_agent = Agent(
    name="Technical Support",
    instructions="""You are a technical support specialist. You help with:
    - API issues and debugging
    - Integration problems
    - Technical documentation
    - Error troubleshooting
    When users mention billing issues, transfer to the Billing Specialist.""",
)

billing_agent = Agent(
    name="Billing Specialist",
    instructions="""You are a billing and accounts specialist. You help with:
    - Payment issues
    - Subscription management
    - Refunds and credits
    - Invoice questions
    When users have technical issues, transfer to Technical Support.""",
)

# Define transfer functions
def transfer_to_travel():
    """Transfer to travel planning agent"""
    return travel_agent

def transfer_to_culture():
    """Transfer to culture and language expert"""
    return culture_agent

def transfer_to_technical():
    """Transfer to technical support"""
    return technical_agent

def transfer_to_billing():
    """Transfer to billing specialist"""
    return billing_agent

# Add transfer functions to agents
travel_agent.functions = [transfer_to_culture]
culture_agent.functions = [transfer_to_travel]
technical_agent.functions = [transfer_to_billing]
billing_agent.functions = [transfer_to_technical]

# Create router agent
router_agent = Agent(
    name="Router",
    instructions="""You are a helpful assistant that routes requests to specialized agents.
    Analyze the user's request and transfer to the appropriate specialist:
    - Travel planning → Travel Planner
    - Language/culture → Culture Expert  
    - Technical issues → Technical Support
    - Billing/payment → Billing Specialist
    
    For general questions, provide a helpful response yourself.""",
    functions=[transfer_to_travel, transfer_to_culture, transfer_to_technical, transfer_to_billing]
)

# Initialize Swarm client
client = Swarm()

def multi_agent_provider(prompt, options, context):
    """Multi-agent provider with automatic routing and handoffs"""
    enable_handoffs = options.get("config", {}).get("enable_handoffs", True)
    
    # Select starting agent based on config
    agents_config = options.get("config", {}).get("agents", [])
    if agents_config:
        # Use specific agents if configured
        if "technical_support" in agents_config:
            starting_agent = technical_agent
        elif "billing_support" in agents_config:
            starting_agent = billing_agent
        else:
            starting_agent = router_agent
    else:
        starting_agent = router_agent
    
    # Run the conversation
    messages = [{"role": "user", "content": prompt}]
    
    response = client.run(
        agent=starting_agent,
        messages=messages,
        context_variables={
            "enable_handoffs": enable_handoffs,
            "user_context": context
        },
        max_turns=5  # Limit handoffs to prevent infinite loops
    )
    
    # Extract the final response
    last_message = response.messages[-1]
    output = last_message["content"]
    
    # Add metadata about agent interactions
    agent_sequence = []
    current_agent = starting_agent.name
    
    for msg in response.messages:
        if msg.get("sender") and msg["sender"] != current_agent:
            agent_sequence.append(msg["sender"])
            current_agent = msg["sender"]
    
    return {
        "output": output,
        "metadata": {
            "starting_agent": starting_agent.name,
            "final_agent": response.agent.name,
            "handoffs": len(agent_sequence),
            "agent_sequence": agent_sequence,
            "total_messages": len(response.messages)
        }
    }

# Export traced version
call_api = create_traced_provider(
    multi_agent_provider,
    service_name="openai-multi-agent",
    provider_type="openai-agents"
) 