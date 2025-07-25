#!/usr/bin/env python3
"""Test script to verify Gemini 2.5 Pro is working correctly."""

import os
import asyncio
from dotenv import load_dotenv
from google.adk.generative_models import GenerativeModel

async def test_gemini():
    """Test basic Gemini functionality."""
    # Load environment variables from current dir and parent dirs
    load_dotenv()  # Load from current directory
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))  # Load from promptfoo root
    
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("❌ GOOGLE_API_KEY not found in environment")
        print("   Please set it in your .env file")
        return False
    
    print("✅ GOOGLE_API_KEY found")
    
    try:
        # Initialize Gemini 2.5 Pro
        model = GenerativeModel("gemini-2.5-pro")
        print("✅ Gemini 2.5 Pro model initialized")
        
        # Test text generation
        response = await model.generate_content_async("Say 'Hello, MTG Card Analyzer is ready!' in exactly those words.")
        print(f"✅ Gemini response: {response.text}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

async def main():
    """Run the test."""
    print("🧪 Testing Gemini 2.5 Pro Connection...")
    print("-" * 50)
    
    success = await test_gemini()
    
    if success:
        print("\n✅ All tests passed! You're ready to run the MTG Card Analyzer.")
        print("\n📝 Next steps:")
        print("1. Add sample MTG card images to the 'samples' directory")
        print("2. Run the server: python server.py")
        print("3. Open http://localhost:8000 in your browser")
    else:
        print("\n❌ Tests failed. Please check your configuration.")

if __name__ == "__main__":
    asyncio.run(main())