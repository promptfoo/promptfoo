#!/usr/bin/env python3
"""
Test script to verify Langflow setup before running promptfoo evaluation.
This script checks if Langflow is running and accessible.
"""

import os
import requests
import sys


def test_langflow_connection():
    """Test if Langflow is running and accessible."""
    langflow_url = os.getenv("LANGFLOW_URL", "http://localhost:7860")
    
    print(f"Testing connection to Langflow at {langflow_url}...")
    
    try:
        # Test basic connection to Langflow
        response = requests.get(f"{langflow_url}/api/v1/version", timeout=5)
        if response.status_code == 200:
            version_info = response.json()
            print(f"✅ Connected to Langflow successfully!")
            print(f"   Version: {version_info.get('version', 'Unknown')}")
            return True
        else:
            print(f"❌ Langflow responded with status code: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"❌ Cannot connect to Langflow at {langflow_url}")
        print("   Make sure Langflow is running with: langflow run")
        return False
    except Exception as e:
        print(f"❌ Error connecting to Langflow: {e}")
        return False


def test_api_key():
    """Test if Langflow API key is configured."""
    api_key = os.getenv("LANGFLOW_API_KEY")
    
    if not api_key:
        print("❌ LANGFLOW_API_KEY environment variable not set")
        print("   Generate one with: langflow api-key")
        return False
    
    if api_key.startswith("sk-"):
        print("✅ LANGFLOW_API_KEY is configured")
        return True
    else:
        print("⚠️  LANGFLOW_API_KEY doesn't look like a valid API key (should start with 'sk-')")
        return False


def test_flow_id():
    """Test if flow ID is configured."""
    flow_id = os.getenv("LANGFLOW_FLOW_ID")
    
    if not flow_id or flow_id == "YOUR_FLOW_ID_HERE":
        print("❌ LANGFLOW_FLOW_ID environment variable not set or still has placeholder value")
        print("   Set it to your actual flow ID from Langflow")
        return False
    
    print("✅ LANGFLOW_FLOW_ID is configured")
    return True


def test_llm_api_keys():
    """Test if LLM provider API keys are configured."""
    keys_to_check = [
        ("OPENAI_API_KEY", "OpenAI"),
        ("ANTHROPIC_API_KEY", "Anthropic"),
        ("GOOGLE_API_KEY", "Google"),
    ]
    
    configured_keys = []
    for key_name, provider_name in keys_to_check:
        if os.getenv(key_name):
            configured_keys.append(provider_name)
    
    if configured_keys:
        print(f"✅ LLM API keys configured for: {', '.join(configured_keys)}")
        return True
    else:
        print("⚠️  No LLM API keys detected")
        print("   You'll need at least one (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)")
        return False


def main():
    """Run all setup tests."""
    print("🔍 Testing Langflow setup for Promptfoo evaluation...")
    print("=" * 50)
    
    tests = [
        ("Langflow Connection", test_langflow_connection),
        ("API Key Configuration", test_api_key),
        ("Flow ID Configuration", test_flow_id),
        ("LLM API Keys", test_llm_api_keys),
    ]
    
    all_passed = True
    
    for test_name, test_func in tests:
        print(f"\n{test_name}:")
        if not test_func():
            all_passed = False
    
    print("\n" + "=" * 50)
    if all_passed:
        print("🎉 All tests passed! You're ready to run the evaluation.")
        print("\nRun the evaluation with:")
        print("   npx promptfoo eval")
    else:
        print("❌ Some tests failed. Please fix the issues above before running the evaluation.")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main()) 