"""
Provider with manual instrumentation
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

from tracing_utils import initialize_tracing, StatusCode
import openai

# Initialize tracer
tracer = initialize_tracing("manual-provider")

def call_api(prompt, options, context):
    """Provider with explicit manual tracing"""
    with tracer.start_as_current_span("manual_provider.call_api") as span:
        span.set_attribute("prompt.length", len(prompt))
        
        try:
            # Create OpenAI client
            client = openai.OpenAI()
            
            # Manually trace the OpenAI call
            with tracer.start_as_current_span("openai.chat.completions") as openai_span:
                openai_span.set_attribute("model", "gpt-4o-mini")
                openai_span.set_attribute("messages.count", 2)
                
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant."},
                        {"role": "user", "content": prompt}
                    ]
                )
                
                openai_span.set_attribute("usage.total_tokens", response.usage.total_tokens)
                openai_span.set_attribute("usage.completion_tokens", response.usage.completion_tokens)
            
            output = response.choices[0].message.content
            span.set_attribute("response.length", len(output))
            span.set_status(StatusCode.OK)
            
            return {"output": output}
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(StatusCode.ERROR, str(e))
            return {"error": str(e)} 