"""
Provider with hybrid instrumentation - combines auto and manual
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

# Enable auto instrumentation first
import auto_instrument
from auto_instrument import traced_operation

import openai
import requests

def call_api(prompt, options, context):
    """Provider that combines automatic and manual instrumentation"""
    
    # Manual span for business logic
    with traced_operation("hybrid_provider.process_request") as span:
        span.set_attribute("provider.type", "hybrid")
        
        # This HTTP call will be auto-instrumented
        try:
            # Example: Check prompt safety (auto-instrumented)
            safety_check = requests.post(
                "https://api.example.com/check-safety",
                json={"text": prompt},
                timeout=5
            )
        except:
            # Mock response if the endpoint doesn't exist
            safety_check = type('obj', (object,), {'status_code': 200})
        
        span.set_attribute("safety.passed", safety_check.status_code == 200)
        
        # OpenAI call is auto-instrumented
        client = openai.OpenAI()
        
        # Add custom span around the response processing
        with traced_operation("hybrid_provider.enhance_response") as enhance_span:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ]
            )
            
            output = response.choices[0].message.content
            
            # Add metadata
            enhanced_output = f"{output}\n\n---\n[Tokens used: {response.usage.total_tokens}]"
            enhance_span.set_attribute("enhancement.added", True)
        
        return {"output": enhanced_output} 