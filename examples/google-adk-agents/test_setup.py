#!/usr/bin/env python3
"""Test script to verify ADK setup."""

try:
    import google.adk
    print("✅ google-adk package found")
    
    from google.adk.agents import Agent
    print("✅ Can import Agent class")
    
    import pydantic
    print("✅ pydantic package found")
    
    from dotenv import load_dotenv
    print("✅ python-dotenv package found")
    
    # Try importing our modules
    from agents.coordinator import travel_coordinator
    print("✅ Can import travel_coordinator")
    
    print("\n🎉 All imports successful! ADK setup is working.")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("\nPlease run: pip install -r requirements.txt") 