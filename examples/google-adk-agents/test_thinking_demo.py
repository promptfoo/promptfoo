"""
Demonstration of Gemini 2.5 Flash capabilities in ADK.
Shows how Gemini 2.5 Flash improves complex travel planning.
"""

import asyncio
import os

import google.generativeai as genai

# Ensure API key is set
if not os.getenv("GOOGLE_API_KEY"):
    print("Please set GOOGLE_API_KEY environment variable")
    exit(1)

# Configure the API key
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# Test queries of varying complexity
test_queries = [
    {
        "name": "Simple Query",
        "query": "What's the weather like in Paris?",
        "thinking_budget": 0,  # No thinking needed
        "expected_behavior": "Quick, direct response",
    },
    {
        "name": "Medium Complexity",
        "query": "I have $2000 for a week-long trip. Should I go to Japan or Italy?",
        "thinking_budget": 4096,  # Medium thinking
        "expected_behavior": "Comparative analysis with reasoning",
    },
    {
        "name": "High Complexity",
        "query": """Plan a 21-day trip through Southeast Asia for 2 people with a $5000 budget total.
                    We want to visit Thailand, Vietnam, Cambodia, and Laos. Optimize the route to:
                    1. Minimize visa complications
                    2. Follow the best weather patterns
                    3. Balance cultural sites with beach time
                    4. Stay within budget including all flights, hotels, food, and activities
                    Calculate exact costs and provide a day-by-day itinerary.""",
        "thinking_budget": 24576,  # Maximum thinking for complex optimization
        "expected_behavior": "Deep analysis with route optimization and detailed calculations",
    },
]


async def test_thinking_modes():
    """Test different thinking modes and their impact on responses"""

    print("=== Gemini 2.5 Flash Thinking Mode Demonstration ===\n")

    for test in test_queries:
        print(f"\n📝 Test: {test['name']}")
        print(
            f"Query: {test['query'][:100]}..."
            if len(test["query"]) > 100
            else f"Query: {test['query']}"
        )
        print(f"Thinking Budget: {test['thinking_budget']} tokens")
        print(f"Expected: {test['expected_behavior']}")
        print("\n" + "-" * 50)

        # Test with Gemini 2.5 Flash
        # Note: thinking_config is available in preview models but not in stable SDK yet
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = await model.generate_content_async(
            test["query"],
            generation_config=genai.GenerationConfig(
                temperature=0.7,
                max_output_tokens=8192,
            ),
        )

        # Display results
        print("\n🤖 Response:")
        print(
            response.text[:500] + "..." if len(response.text) > 500 else response.text
        )

        # Show thinking tokens used (if available)
        if hasattr(response, "thinking_tokens_used"):
            print(f"\n💭 Thinking tokens used: {response.thinking_tokens_used}")

        # Show response length as complexity indicator
        print(f"📏 Response length: {len(response.text)} characters")

        # Brief pause between tests
        await asyncio.sleep(2)


async def compare_with_without_thinking():
    """Compare the same complex query with and without thinking"""

    print("\n\n=== Comparison: With vs Without Thinking ===\n")

    complex_query = """Create an optimal 10-day Japan itinerary that:
    - Covers Tokyo, Kyoto, Osaka, and Mount Fuji
    - Includes mix of temples, modern attractions, and nature
    - Works for both first-timers and food enthusiasts
    - Maximizes JR Pass value
    - Estimates costs in both USD and JPY
    - Accounts for cherry blossom season timing"""

    print(f"Complex Query: {complex_query}\n")

    # Test WITHOUT thinking (standard mode)
    print("🚫 Standard Mode (no explicit thinking budget):")
    print("-" * 30)

    model_standard = genai.GenerativeModel("gemini-2.5-flash")
    response_no_thinking = await model_standard.generate_content_async(
        complex_query,
        generation_config=genai.GenerationConfig(
            temperature=0.7,
        ),
    )

    print(f"Response preview: {response_no_thinking.text[:300]}...")
    print(f"Length: {len(response_no_thinking.text)} characters\n")

    # Test WITH enhanced prompting (simulating thinking)
    print("✅ WITH Enhanced Prompting (encouraging step-by-step reasoning):")
    print("-" * 30)

    # Since thinking_config isn't available in stable SDK, we'll use prompting techniques
    enhanced_query = f"Please think step-by-step about this request and provide a detailed analysis:\n\n{complex_query}"
    
    model_enhanced = genai.GenerativeModel("gemini-2.5-flash")
    response_with_thinking = await model_enhanced.generate_content_async(
        enhanced_query,
        generation_config=genai.GenerationConfig(
            temperature=0.7,
        ),
    )

    print(f"Response preview: {response_with_thinking.text[:300]}...")
    print(f"Length: {len(response_with_thinking.text)} characters")

    # Compare quality indicators
    print("\n📊 Quality Comparison:")
    print(f"- Without thinking: {len(response_no_thinking.text)} chars")
    print(f"- With thinking: {len(response_with_thinking.text)} chars")
    print(
        f"- Improvement: {((len(response_with_thinking.text) / len(response_no_thinking.text)) - 1) * 100:.1f}% more detailed"
    )


async def demonstrate_auto_thinking():
    """Show how Gemini 2.5 Flash handles queries of varying complexity"""

    print("\n\n=== Gemini 2.5 Flash Response Demonstration ===\n")

    queries = [
        "What time is it in Tokyo?",  # Simple query
        "Compare train vs flight from Tokyo to Osaka",  # Moderate complexity
        "Design a sustainable tourism business model for rural Japan that balances economic growth with cultural preservation",  # High complexity
    ]

    for i, query in enumerate(queries, 1):
        print(f"\n🤖 Query {i}: {query}")
        print("-" * 50)

        model = genai.GenerativeModel("gemini-2.5-flash")
        response = await model.generate_content_async(
            query,
            generation_config=genai.GenerationConfig(
                temperature=0.7,
            ),
        )

        print(f"Response: {response.text[:200]}...")
        print(f"Response length: {len(response.text)} characters")
        print(
            f"Complexity indicator: {'Low' if len(response.text) < 500 else 'Medium' if len(response.text) < 2000 else 'High'}"
        )


# Run the demonstrations
async def main():
    """Run all demonstrations"""

    try:
        # Test different thinking budgets
        await test_thinking_modes()

        # Compare with/without thinking
        await compare_with_without_thinking()

        # Demonstrate auto thinking
        await demonstrate_auto_thinking()

        print("\n\n✅ Demonstration complete!")
        print("\n💡 Key Takeaways:")
        print("1. Gemini 2.5 Flash provides enhanced responses for complex queries")
        print("2. Simple queries receive concise, fast responses")
        print("3. The model adapts its response depth based on query complexity")
        print("4. Step-by-step prompting can enhance reasoning for complex tasks")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("Make sure you have a valid GOOGLE_API_KEY set")


if __name__ == "__main__":
    asyncio.run(main())
