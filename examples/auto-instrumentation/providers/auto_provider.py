"""
Provider with automatic instrumentation - zero code required!
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

# Just import auto_instrument - that's it!
import auto_instrument

import openai

def call_api(prompt, options, context):
    """Provider that automatically traces all OpenAI calls"""
    # No manual tracing code needed!
    client = openai.OpenAI()
    
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt}
        ]
    )
    
    return {"output": response.choices[0].message.content} 