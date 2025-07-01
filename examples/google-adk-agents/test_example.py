#!/usr/bin/env python3
"""
Test script for Google ADK travel planning agents.
Run this to verify your setup is working correctly.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def test_setup():
    """Test that the ADK setup is working correctly."""

    print("Google ADK Travel Planning Agents - Setup Test")
    print("=" * 60)

    # Check for API key
    if not os.getenv("GOOGLE_API_KEY"):
        print("❌ GOOGLE_API_KEY not set!")
        print("Please set it in your .env file or environment")
        return False

    print("✅ API key found")

    # Test imports
    import importlib.util

    # Define modules to test
    modules_to_test = [
        ("google.adk.agents", "Agent class"),
        ("google.adk.tools", "google_search tool"),
        ("google.adk.runners", "InMemoryRunner"),
        ("agents.coordinator", "travel_coordinator agent"),
    ]

    all_imports_successful = True

    for module_name, description in modules_to_test:
        if importlib.util.find_spec(module_name) is not None:
            print(f"✅ Can import {description}")
        else:
            print(f"❌ Cannot import {description}")
            all_imports_successful = False

    if all_imports_successful:
        print("\n🎉 All imports successful! ADK setup is working.")
        print("\nTo run your agent, use one of these commands:")
        print("  - Interactive Web UI: adk web")
        print("  - Command Line: adk run .")
        print("  - Promptfoo Eval: npm run local -- eval -c promptfooconfig.yaml")
        return True
    else:
        print("\nPlease ensure all dependencies are installed:")
        print("  pip install -r requirements.txt")
        return False


if __name__ == "__main__":
    test_setup()
