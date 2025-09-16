#!/usr/bin/env python3
"""
Basic test script for persistent Python provider validation
Tests fundamental functionality, state persistence, and edge cases
"""

import json
import random
import time
import sys
from datetime import datetime

# Global state to test persistence
call_count = 0
initialized_data = None

def init_provider():
    """Initialize provider - should only be called once in persistent mode"""
    global initialized_data
    initialized_data = {
        "initialized_at": datetime.now().isoformat(),
        "random_seed": random.randint(1, 1000000)
    }
    return {"status": "initialized", "data": initialized_data}

def call_api(prompt, options=None, context=None, state=None):
    """Main API function for testing"""
    global call_count
    call_count += 1

    if options is None:
        options = {}
    if context is None:
        context = {}

    # Test different prompt types
    prompt_lower = prompt.lower()

    if "2 + 2" in prompt_lower:
        return {
            "output": "4",
            "call_count": call_count,
            "persistent_data": initialized_data,
            "context_received": bool(context),
            "metadata": {
                "calculation": "basic_math",
                "timestamp": datetime.now().isoformat()
            }
        }

    elif "random number" in prompt_lower:
        # Use persistent seed if available (persistent mode should have same seed)
        if initialized_data and 'random_seed' in initialized_data:
            # In persistent mode, we'll get consistent "random" numbers based on call count
            result = (initialized_data['random_seed'] + call_count) % 100 + 1
        else:
            # Traditional mode gets truly random numbers
            result = random.randint(1, 100)

        return {
            "output": str(result),
            "call_count": call_count,
            "persistent_data": initialized_data,
            "mode": "persistent" if initialized_data else "traditional"
        }

    elif "timestamp" in prompt_lower:
        return {
            "output": datetime.now().isoformat(),
            "call_count": call_count,
            "persistent_data": initialized_data
        }

    elif "fibonacci" in prompt_lower:
        # Extract number from prompt
        import re
        match = re.search(r'fibonacci\((\d+)\)', prompt_lower)
        if match:
            n = int(match.group(1))
            result = fibonacci(n)
            return {
                "output": str(result),
                "call_count": call_count,
                "persistent_data": initialized_data,
                "computation": f"fibonacci({n})"
            }
        else:
            return {"error": "Invalid fibonacci request"}

    elif "process this text" in prompt_lower:
        # Extract text in quotes
        import re
        match = re.search(r"'([^']*)'", prompt)
        if match:
            text = match.group(1)
            processed = {
                "original": text,
                "uppercase": text.upper(),
                "lowercase": text.lower(),
                "reversed": text[::-1],
                "length": len(text)
            }
            return {
                "output": processed,
                "call_count": call_count,
                "persistent_data": initialized_data
            }

    # Default response
    return {
        "output": f"Processed prompt: {prompt}",
        "call_count": call_count,
        "persistent_data": initialized_data,
        "options_received": options,
        "context_received": context
    }

def fibonacci(n):
    """Calculate fibonacci number"""
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

# Test class-based provider (alternative pattern)
class TestProvider:
    def __init__(self):
        self.instance_call_count = 0
        self.instance_id = random.randint(1000, 9999)

    def call_api(self, prompt, options=None, context=None):
        self.instance_call_count += 1
        return {
            "output": f"Class-based response to: {prompt}",
            "instance_call_count": self.instance_call_count,
            "instance_id": self.instance_id,
            "class_based": True
        }

# For testing embedding API
def call_embedding_api(prompt, options=None):
    """Test embedding API functionality"""
    # Simple mock embedding based on prompt length and content
    embedding = [hash(prompt) % 100 / 100.0 + i * 0.01 for i in range(10)]
    return {
        "embedding": embedding,
        "call_count": call_count,
        "persistent_data": initialized_data
    }

# For testing classification API
def call_classification_api(prompt, options=None):
    """Test classification API functionality"""
    # Simple mock classification
    classification = {
        "label": "positive" if any(word in prompt.lower() for word in ["good", "great", "excellent"]) else "neutral",
        "confidence": 0.85,
        "categories": ["text_analysis"]
    }
    return {
        "classification": classification,
        "call_count": call_count,
        "persistent_data": initialized_data
    }

if __name__ == "__main__":
    # Direct test mode
    print("Testing basic_test.py directly")
    print(json.dumps(init_provider(), indent=2))
    print(json.dumps(call_api("What is 2 + 2?"), indent=2))
    print(json.dumps(call_api("Generate a random number between 1 and 100"), indent=2))