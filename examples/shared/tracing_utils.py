"""
Shared OpenTelemetry tracing utilities for Promptfoo Python examples
"""

from functools import wraps
from typing import Any, Callable, Dict, Optional
import json

from opentelemetry import trace
from opentelemetry.propagate import extract
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.trace import StatusCode


def initialize_tracing(
    service_name: str, 
    endpoint: str = "http://localhost:4318/v1/traces"
) -> trace.Tracer:
    """
    Initialize OpenTelemetry tracing
    
    Args:
        service_name: Name of the service/agent
        endpoint: OTLP endpoint URL
        
    Returns:
        Configured tracer instance
    """
    resource = Resource.create({
        ResourceAttributes.SERVICE_NAME: service_name,
        ResourceAttributes.SERVICE_VERSION: "1.0.0",
    })
    
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=endpoint)
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    
    return trace.get_tracer(service_name)


def wrap_with_tracing(span_name: str, tracer: trace.Tracer):
    """
    Decorator to wrap a function with tracing
    
    Args:
        span_name: Name for the span
        tracer: Tracer instance
        
    Returns:
        Decorated function
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            with tracer.start_as_current_span(span_name) as span:
                span.set_attribute("function.name", func.__name__)
                span.set_attribute("function.args.count", len(args))
                
                try:
                    result = func(*args, **kwargs)
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as e:
                    span.record_exception(e)
                    span.set_status(StatusCode.ERROR, str(e))
                    raise
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            with tracer.start_as_current_span(span_name) as span:
                span.set_attribute("function.name", func.__name__)
                span.set_attribute("function.args.count", len(args))
                
                try:
                    result = await func(*args, **kwargs)
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as e:
                    span.record_exception(e)
                    span.set_status(StatusCode.ERROR, str(e))
                    raise
        
        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return wrapper
    
    return decorator


def run_with_trace_context(context: Dict[str, Any], func: Callable, *args, **kwargs):
    """
    Extract trace context and run function within it
    
    Args:
        context: Promptfoo context with traceparent
        func: Function to run within trace context
        *args, **kwargs: Arguments for the function
        
    Returns:
        Result of the function
    """
    if 'traceparent' in context:
        ctx = extract({"traceparent": context["traceparent"]})
        token = trace.context.attach(ctx)
        try:
            return func(*args, **kwargs)
        finally:
            trace.context.detach(token)
    else:
        # Run without trace context
        return func(*args, **kwargs)


def create_traced_provider(
    provider_func: Callable,
    service_name: str,
    provider_type: str = "agent"
) -> Callable:
    """
    Create a traced provider wrapper
    
    Args:
        provider_func: Provider function to wrap
        service_name: Service name for tracing
        provider_type: Type of provider (e.g., 'agent', 'llm')
        
    Returns:
        Wrapped provider function
    """
    tracer = initialize_tracing(service_name)
    
    def traced_provider(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Wrapped provider with tracing"""
        
        def _run():
            with tracer.start_as_current_span(f"{provider_type}.call_api") as span:
                span.set_attribute("provider.type", provider_type)
                span.set_attribute("provider.service", service_name)
                span.set_attribute("prompt.text", prompt)
                span.set_attribute("prompt.length", len(prompt))
                
                if options and "vars" in options:
                    span.set_attribute("vars.count", len(options["vars"]))
                
                try:
                    result = provider_func(prompt, options, context)
                    
                    if "output" in result:
                        span.set_attribute("response.length", len(str(result["output"])))
                    
                    span.set_attribute("response.success", "error" not in result)
                    span.set_status(
                        StatusCode.ERROR if "error" in result else StatusCode.OK
                    )
                    
                    return result
                except Exception as e:
                    span.record_exception(e)
                    span.set_status(StatusCode.ERROR, str(e))
                    return {
                        "output": f"Error: {str(e)}",
                        "error": str(e)
                    }
        
        return run_with_trace_context(context, _run)
    
    return traced_provider


def wrap_tool_with_tracing(tool_func: Callable, tool_name: str, tracer: trace.Tracer) -> Callable:
    """
    Wrap a tool function with tracing
    
    Args:
        tool_func: Tool function to wrap
        tool_name: Name of the tool
        tracer: Tracer instance
        
    Returns:
        Wrapped tool function
    """
    @wraps(tool_func)
    def wrapped(*args, **kwargs):
        with tracer.start_as_current_span(f"tool.{tool_name}") as span:
            span.set_attribute("tool.name", tool_name)
            span.set_attribute("tool.args", json.dumps({"args": args, "kwargs": kwargs}, default=str))
            
            try:
                result = tool_func(*args, **kwargs)
                span.set_attribute("tool.success", True)
                span.set_status(StatusCode.OK)
                return result
            except Exception as e:
                span.record_exception(e)
                span.set_status(StatusCode.ERROR, str(e))
                raise
    
    @wraps(tool_func)
    async def async_wrapped(*args, **kwargs):
        with tracer.start_as_current_span(f"tool.{tool_name}") as span:
            span.set_attribute("tool.name", tool_name)
            span.set_attribute("tool.args", json.dumps({"args": args, "kwargs": kwargs}, default=str))
            
            try:
                result = await tool_func(*args, **kwargs)
                span.set_attribute("tool.success", True)
                span.set_status(StatusCode.OK)
                return result
            except Exception as e:
                span.record_exception(e)
                span.set_status(StatusCode.ERROR, str(e))
                raise
    
    # Return appropriate wrapper based on function type
    import asyncio
    if asyncio.iscoroutinefunction(tool_func):
        return async_wrapped
    return wrapped


class TracedAgent:
    """Base class for agents with built-in tracing support"""
    
    def __init__(self, service_name: str, agent_type: str = "agent"):
        self.tracer = initialize_tracing(service_name)
        self.service_name = service_name
        self.agent_type = agent_type
    
    def trace_method(self, span_name: str):
        """Decorator for tracing agent methods"""
        return wrap_with_tracing(span_name, self.tracer)
    
    def run_with_tracing(self, prompt: str, context: Dict[str, Any]) -> Any:
        """Run agent with tracing context"""
        def _run():
            with self.tracer.start_as_current_span(f"{self.agent_type}.run") as span:
                span.set_attribute("agent.service", self.service_name)
                span.set_attribute("agent.type", self.agent_type)
                span.set_attribute("prompt.text", prompt)
                span.set_attribute("prompt.length", len(prompt))
                
                try:
                    result = self.run(prompt)
                    span.set_status(StatusCode.OK)
                    return result
                except Exception as e:
                    span.record_exception(e)
                    span.set_status(StatusCode.ERROR, str(e))
                    raise
        
        return run_with_trace_context(context, _run)
    
    def run(self, prompt: str) -> Any:
        """Override this method in subclasses"""
        raise NotImplementedError("Subclasses must implement run()")


# Export common status codes for convenience
__all__ = [
    "initialize_tracing",
    "wrap_with_tracing", 
    "run_with_trace_context",
    "create_traced_provider",
    "wrap_tool_with_tracing",
    "TracedAgent",
    "StatusCode",
] 