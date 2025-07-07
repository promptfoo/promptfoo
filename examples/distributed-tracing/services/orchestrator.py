"""
Orchestrator service that coordinates multiple microservices
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

import asyncio
import aiohttp
from tracing_utils import initialize_tracing, StatusCode
from opentelemetry.propagate import inject

# Initialize tracer
tracer = initialize_tracing("orchestrator")

async def call_service(service_url, query, headers):
    """Call a downstream service with trace propagation"""
    async with aiohttp.ClientSession() as session:
        # Inject trace context into headers
        inject(headers)
        
        async with session.post(
            service_url,
            json={"query": query},
            headers=headers
        ) as response:
            return await response.json()

def call_api(prompt, options, context):
    """Orchestrator that coordinates multiple services"""
    with tracer.start_as_current_span("orchestrator.process") as span:
        span.set_attribute("query.length", len(prompt))
        
        try:
            # Prepare headers with trace context
            headers = {"Content-Type": "application/json"}
            
            # Call search service
            with tracer.start_as_current_span("call.search_service") as search_span:
                search_span.set_attribute("service.name", "search")
                # In real implementation, would call actual service
                search_results = {"results": ["Result 1", "Result 2"]}
                search_span.set_attribute("results.count", len(search_results["results"]))
            
            # Call RAG service with search results
            with tracer.start_as_current_span("call.rag_service") as rag_span:
                rag_span.set_attribute("service.name", "rag")
                rag_span.set_attribute("context.documents", len(search_results["results"]))
                
                # Simulate RAG processing
                rag_response = f"Based on the search results for '{prompt}', here's a comprehensive answer..."
                rag_span.set_attribute("response.length", len(rag_response))
            
            # Cache the result
            with tracer.start_as_current_span("cache.write") as cache_span:
                cache_span.set_attribute("cache.key", hash(prompt))
                cache_span.set_attribute("cache.ttl", 3600)
                # Simulate cache write
            
            span.set_attribute("orchestration.success", True)
            span.set_status(StatusCode.OK)
            
            return {
                "output": rag_response,
                "metadata": {
                    "services_called": ["search", "rag", "cache"],
                    "total_latency": "simulated"
                }
            }
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(StatusCode.ERROR, str(e))
            return {"error": str(e)} 