#!/usr/bin/env python3
"""Test token tracking functionality."""

import os
import asyncio
from dotenv import load_dotenv

from agents.gemini_base import GeminiAgent


async def test_token_tracking():
    """Test basic token tracking functionality."""
    # Load environment variables
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
    
    if not os.getenv("GOOGLE_API_KEY"):
        print("❌ GOOGLE_API_KEY not found")
        return
    
    print("🧪 Testing Token Tracking...")
    print("-" * 50)
    
    # Create a test agent
    test_agent = GeminiAgent(
        name="TestAgent",
        model_name="gemini-2.5-pro",
        instructions="You are a helpful assistant.",
        track_tokens=True
    )
    
    # Test prompts with different sizes
    test_prompts = [
        "Say hello in 5 words.",
        "Write a haiku about Magic: The Gathering cards.",
        "Describe the process of grading trading cards in 50 words."
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        print(f"\n📝 Test {i}: {prompt[:50]}...")
        try:
            response = await test_agent.run(prompt)
            print(f"✅ Response: {response[:100]}...")
        except Exception as e:
            print(f"❌ Error: {e}")
    
    # Get token usage summary
    print("\n" + "="*50)
    print("📊 TOKEN USAGE SUMMARY")
    print("="*50)
    
    # Agent-specific usage
    agent_usage = test_agent.get_token_usage()
    print(f"\nTest Agent Usage:")
    print(f"  - Total requests: {agent_usage['total_requests']}")
    print(f"  - Total tokens: {agent_usage['total_tokens']:,}")
    print(f"  - Prompt tokens: {agent_usage['total_prompt_tokens']:,}")
    print(f"  - Completion tokens: {agent_usage['total_completion_tokens']:,}")
    print(f"  - Total cost: ${agent_usage['total_cost_usd']:.4f}")
    print(f"  - Avg tokens/request: {agent_usage['average_tokens_per_request']:,}")
    print(f"  - Avg cost/request: ${agent_usage['average_cost_per_request']:.4f}")
    
    # Global usage (same as agent usage in this test)
    global_usage = GeminiAgent.get_global_token_usage()
    print(f"\nGlobal Usage:")
    print(f"  - Total cost: ${global_usage['total_cost_usd']:.4f}")
    
    # Pricing breakdown
    print("\n💰 PRICING INFORMATION")
    print("="*50)
    print("Gemini 2.5 Pro Pricing (Standard Context):")
    print("  - Input: $1.25 per million tokens")
    print("  - Output: $10.00 per million tokens")
    print("\nFor context:")
    print("  - 1,000 tokens ≈ 750 words")
    print("  - This test used approximately", f"${global_usage['total_cost_usd']:.4f}")


if __name__ == "__main__":
    asyncio.run(test_token_tracking())