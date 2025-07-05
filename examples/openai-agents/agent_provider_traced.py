"""
OpenAI Agents provider with OpenTelemetry tracing support
"""
from swarm import Swarm, Agent
import json

# OpenTelemetry imports
from opentelemetry import trace
from opentelemetry.propagate import extract
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

# Setup OpenTelemetry
provider = TracerProvider()
exporter = OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")
provider.add_span_processor(SimpleSpanProcessor(exporter))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("openai.agents")

# Define agent functions
def check_order_status(order_id: str) -> str:
    """Check the status of an order"""
    mock_orders = {
        "12345": "shipped",
        "67890": "processing",
        "11111": "delivered"
    }
    status = mock_orders.get(order_id, "not found")
    return f"Order {order_id} status: {status}"

def transfer_to_billing():
    """Transfer to billing department"""
    return billing_agent

def transfer_to_support():
    """Transfer to technical support"""
    return support_agent

# Define specialized agents
billing_agent = Agent(
    name="Billing Specialist",
    instructions="You handle billing inquiries. Be helpful and professional.",
    functions=[check_order_status]
)

support_agent = Agent(
    name="Technical Support",
    instructions="You handle technical issues. Be patient and thorough.",
    functions=[]
)

# Main triage agent
triage_agent = Agent(
    name="Customer Service Triage",
    instructions="""You are a customer service triage agent.
    Route billing questions to the billing specialist.
    Route technical issues to technical support.
    Handle general inquiries yourself.""",
    functions=[transfer_to_billing, transfer_to_support, check_order_status]
)

# Initialize Swarm client
client = Swarm()

def call_api(prompt, options, context):
    """
    Promptfoo provider function that runs the OpenAI Agents
    
    Args:
        prompt: The user's input
        options: Additional options from Promptfoo
        context: Context information from Promptfoo
    
    Returns:
        Dict with the agent's response
    """
    # Extract trace context if provided
    if 'traceparent' in context:
        ctx = extract({"traceparent": context["traceparent"]})
        with tracer.start_as_current_span("openai.agents.call", context=ctx) as span:
            span.set_attribute("agent.framework", "openai-agents")
            span.set_attribute("agent.model", "gpt-4.1")
            span.set_attribute("prompt.text", prompt)
            span.set_attribute("prompt.length", len(prompt))
            
            try:
                # Track agent execution
                with tracer.start_as_current_span("swarm.run") as run_span:
                    messages = [{"role": "user", "content": prompt}]
                    response = client.run(
                        agent=triage_agent,
                        messages=messages
                    )
                    run_span.set_attribute("agent.name", response.agent.name)
                    run_span.set_attribute("messages.count", len(response.messages))
                
                # Extract the response
                last_message = response.messages[-1]
                output = last_message["content"]
                
                # Track which agent handled the request
                span.set_attribute("final_agent", response.agent.name)
                span.set_attribute("response.length", len(output))
                span.set_attribute("agent.success", True)
                
                # Track any tool calls
                if hasattr(response, 'tool_calls'):
                    span.set_attribute("tool_calls.count", len(response.tool_calls))
                
                return {
                    "output": output,
                    "metadata": {
                        "agent": response.agent.name,
                        "message_count": len(response.messages)
                    }
                }
            except Exception as e:
                span.record_exception(e)
                span.set_attribute("agent.success", False)
                return {
                    "output": f"Error: {str(e)}",
                    "error": str(e)
                }
    else:
        # Run without tracing if no trace context
        try:
            messages = [{"role": "user", "content": prompt}]
            response = client.run(
                agent=triage_agent,
                messages=messages
            )
            
            last_message = response.messages[-1]
            return {
                "output": last_message["content"],
                "metadata": {
                    "agent": response.agent.name,
                    "message_count": len(response.messages)
                }
            }
        except Exception as e:
            return {
                "output": f"Error: {str(e)}",
                "error": str(e)
            } 