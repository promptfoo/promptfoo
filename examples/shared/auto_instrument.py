"""
Automatic instrumentation for Python providers

This module provides zero-code instrumentation for common Python libraries
used in agent frameworks. Simply import this at the top of your provider
to automatically instrument HTTP calls, database queries, and more.

Usage:
    import auto_instrument  # That's it!
"""

import os
import logging
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.auto_instrumentation import sitecustomize

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def setup_auto_instrumentation():
    """Set up automatic instrumentation for common libraries"""
    
    # Check if already instrumented
    if hasattr(setup_auto_instrumentation, '_initialized'):
        return
    setup_auto_instrumentation._initialized = True
    
    # Create resource
    resource = Resource.create({
        "service.name": os.getenv("OTEL_SERVICE_NAME", "promptfoo-provider"),
        "service.version": "1.0.0",
        "deployment.environment": os.getenv("ENVIRONMENT", "development")
    })
    
    # Set up tracer provider
    provider = TracerProvider(resource=resource)
    
    # Configure OTLP exporter
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
    exporter = OTLPSpanExporter(
        endpoint=f"{otlp_endpoint}/v1/traces",
        headers={}
    )
    
    # Add span processor
    provider.add_span_processor(BatchSpanProcessor(exporter))
    
    # Set as global tracer provider
    trace.set_tracer_provider(provider)
    
    # Import and configure instrumentations
    try:
        # HTTP instrumentation
        from opentelemetry.instrumentation.requests import RequestsInstrumentor
        RequestsInstrumentor().instrument()
        logger.info("Instrumented requests library")
    except ImportError:
        pass
    
    try:
        # urllib3 instrumentation
        from opentelemetry.instrumentation.urllib3 import URLLib3Instrumentor
        URLLib3Instrumentor().instrument()
        logger.info("Instrumented urllib3 library")
    except ImportError:
        pass
    
    try:
        # httpx instrumentation
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        HTTPXClientInstrumentor().instrument()
        logger.info("Instrumented httpx library")
    except ImportError:
        pass
    
    try:
        # OpenAI instrumentation
        from opentelemetry.instrumentation.openai import OpenAIInstrumentor
        OpenAIInstrumentor().instrument()
        logger.info("Instrumented OpenAI library")
    except ImportError:
        pass
    
    try:
        # Anthropic instrumentation (if available)
        from opentelemetry.instrumentation.anthropic import AnthropicInstrumentor
        AnthropicInstrumentor().instrument()
        logger.info("Instrumented Anthropic library")
    except ImportError:
        pass
    
    try:
        # LangChain instrumentation
        from opentelemetry.instrumentation.langchain import LangChainInstrumentor
        LangChainInstrumentor().instrument()
        logger.info("Instrumented LangChain")
    except ImportError:
        pass
    
    try:
        # SQLAlchemy instrumentation
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        SQLAlchemyInstrumentor().instrument()
        logger.info("Instrumented SQLAlchemy")
    except ImportError:
        pass
    
    try:
        # Redis instrumentation
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        RedisInstrumentor().instrument()
        logger.info("Instrumented Redis")
    except ImportError:
        pass
    
    try:
        # Boto3 (AWS) instrumentation
        from opentelemetry.instrumentation.boto3sqs import Boto3SQSInstrumentor
        from opentelemetry.instrumentation.botocore import BotocoreInstrumentor
        BotocoreInstrumentor().instrument()
        Boto3SQSInstrumentor().instrument()
        logger.info("Instrumented AWS SDK")
    except ImportError:
        pass
    
    logger.info(f"Auto-instrumentation complete. Sending traces to {otlp_endpoint}")

# Automatically set up instrumentation when imported
setup_auto_instrumentation()

# Export convenience functions
def get_tracer(name: str = __name__) -> trace.Tracer:
    """Get a tracer instance"""
    return trace.get_tracer(name)

def disable_instrumentation():
    """Disable all instrumentations"""
    # This would need to track instrumentors and uninstrument them
    logger.warning("Uninstrumentation not implemented yet")

# Context manager for custom spans
class traced_operation:
    """Context manager for creating custom spans
    
    Usage:
        with traced_operation("my_operation") as span:
            span.set_attribute("custom.attribute", "value")
            # Your code here
    """
    
    def __init__(self, name: str, tracer_name: str = __name__):
        self.name = name
        self.tracer = trace.get_tracer(tracer_name)
        self.span = None
    
    def __enter__(self):
        self.span = self.tracer.start_span(self.name)
        self.token = trace.use_span(self.span, end_on_exit=True)
        self.token.__enter__()
        return self.span
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.span.record_exception(exc_val)
            self.span.set_status(trace.Status(trace.StatusCode.ERROR, str(exc_val)))
        self.token.__exit__(exc_type, exc_val, exc_tb) 