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
    try:
        from google.adk.agents import Agent
        print("✅ Can import Agent class")
        
        from google.adk.tools import google_search
        print("✅ Can import google_search tool")
        
        from google.adk.runners import InMemoryRunner
        print("✅ Can import InMemoryRunner")
        
        from agents.coordinator import travel_coordinator
        print("✅ Can import travel_coordinator agent")
        
        print("\n🎉 All imports successful! ADK setup is working.")
        print("\nTo run your agent, use one of these commands:")
        print("  - Interactive Web UI: adk web")
        print("  - Command Line: adk run .")
        print("  - Promptfoo Eval: npm run local -- eval -c promptfooconfig.yaml")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("\nPlease ensure all dependencies are installed:")
        print("  pip install -r requirements.txt")
        return False


if __name__ == "__main__":
    test_setup() 