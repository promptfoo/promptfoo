#!/usr/bin/env python3
"""Test script to verify ADK setup."""

import importlib.util

# Define packages and modules to test
packages_to_test = [
    ("google.adk", "google-adk package"),
    ("google.adk.agents", "Agent class"),
    ("pydantic", "pydantic package"),
    ("dotenv", "python-dotenv package"),
    ("agents.coordinator", "travel_coordinator"),
]

# Test each import
all_successful = True
for module_name, description in packages_to_test:
    if importlib.util.find_spec(module_name) is not None:
        print(f"✅ {description} found")
    else:
        print(f"❌ {description} not found")
        all_successful = False

if all_successful:
    print("\n🎉 All imports successful! ADK setup is working.")
else:
    print("\nPlease run: pip install -r requirements.txt")
