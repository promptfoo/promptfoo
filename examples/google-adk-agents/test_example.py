#!/usr/bin/env python3
"""
Test script for Google ADK travel planning agents.
Run this to verify your setup is working correctly.
"""

import asyncio
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import agents
from agents.coordinator import travel_coordinator


async def test_agent():
    """Test the travel coordinator agent with various queries."""
    
    # Check for API key
    if not os.getenv("GOOGLE_API_KEY"):
        print("❌ GOOGLE_API_KEY not set!")
        print("Please set it in your .env file or environment")
        return
    
    print("✅ API key found")
    print("🚀 Testing Google ADK Travel Planning Agent\n")
    
    # Test queries
    test_queries = [
        "What's the weather like in Tokyo in April?",
        "Find cheap flights from New York to London",
        "Plan a 3-day trip to Paris with a $2000 budget"
    ]
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n{'='*60}")
        print(f"Test {i}: {query}")
        print('='*60)
        
        try:
            result = await travel_coordinator.run(query)
            
            # Extract response text
            if hasattr(result, 'text'):
                print(f"\nResponse:\n{result.text}")
            elif hasattr(result, 'output'):
                print(f"\nResponse:\n{result.output}")
            else:
                print(f"\nResponse:\n{result}")
                
        except Exception as e:
            print(f"\n❌ Error: {e}")
    
    print("\n✅ Testing complete!")


if __name__ == "__main__":
    print("Google ADK Travel Planning Agents - Test Script")
    print("=" * 60)
    asyncio.run(test_agent()) 