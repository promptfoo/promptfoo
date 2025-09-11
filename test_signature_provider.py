#!/usr/bin/env python3
"""
Test 2: Function Signature Flexibility
Tests different function signatures to verify signature inspection works
"""

counter = 0

def call_simple(prompt):
    """Simple function with just prompt"""
    return {"output": f"Simple: {prompt}", "signature": "call_simple(prompt)"}

def call_with_options(prompt, options):
    """Function with prompt and options"""
    return {
        "output": f"With options: {prompt}", 
        "options": options,
        "signature": "call_with_options(prompt, options)"
    }

def call_full(prompt, options, context):
    """Function with prompt, options, and context"""
    return {
        "output": f"Full: {prompt}",
        "options": options,
        "context_keys": list(context.keys()) if context else [],
        "signature": "call_full(prompt, options, context)"
    }

def call_with_state(prompt, options, context, state):
    """Function with all parameters including state"""
    global counter
    counter += 1
    
    # Modify state to test persistence
    if state is not None:
        state['call_count'] = state.get('call_count', 0) + 1
    
    return {
        "output": f"With state: {prompt}",
        "global_counter": counter,
        "state_counter": state.get('call_count', 0) if state else 0,
        "signature": "call_with_state(prompt, options, context, state)"
    }

def call_kwargs(**kwargs):
    """Function with **kwargs to test flexible parameter passing"""
    return {
        "output": f"Kwargs: {kwargs.get('prompt', 'no prompt')}",
        "received_kwargs": list(kwargs.keys()),
        "signature": "call_kwargs(**kwargs)"
    }