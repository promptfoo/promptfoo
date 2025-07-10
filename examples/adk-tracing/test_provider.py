#!/usr/bin/env python3
"""
Test script to demonstrate the provider functionality.
"""

import os
import sys
from provider import call_api

# Test without API key
print("Testing provider without API key:")
result = call_api(
    "quantum computing advances",
    {},
    {"traceparent": "00-12345678901234567890123456789012-1234567890123456-01"}
)
print(f"Result: {result}\n")

# Test with mock API key (will fail with invalid key error from OpenAI)
print("Testing provider with mock API key:")
os.environ["OPENAI_API_KEY"] = "sk-mock-key-for-testing"
result = call_api(
    "quantum computing advances",
    {},
    {"traceparent": "00-12345678901234567890123456789012-1234567890123456-01"}
)
print(f"Result: {result}")

# To run with a real API key:
# export OPENAI_API_KEY="your-real-key"
# python test_provider.py 