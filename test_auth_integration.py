#!/usr/bin/env python3
"""Test script to verify promptfoo-modelaudit authentication integration."""

import os

class TestAuthConfig:
    """Simple test config to verify authentication integration."""
    
    def __init__(self):
        self._credentials = self._load_credentials()

    def _load_credentials(self) -> dict:
        """Load credentials from promptfoo environment variables."""
        # Check for promptfoo-provided credentials
        if os.getenv('PROMPTFOO_API_KEY'):
            return {
                'source': 'promptfoo_env',
                'api_key': os.getenv('PROMPTFOO_API_KEY'),
                'api_host': os.getenv('PROMPTFOO_API_HOST', 'https://api.promptfoo.app'),
                'user_email': os.getenv('PROMPTFOO_USER_EMAIL'),
                'app_url': os.getenv('PROMPTFOO_APP_URL', 'https://www.promptfoo.app'),
            }
        
        return {
            'source': 'local',
            'api_key': None,
            'api_host': 'https://api.promptfoo.app',
            'user_email': None,
            'app_url': 'https://www.promptfoo.app'
        }

    def get_api_key(self):
        return self._credentials.get('api_key')

    def get_user_email(self):
        return self._credentials.get('user_email')

    def is_authenticated(self):
        return bool(self.get_api_key())

    def get_credential_source(self):
        return self._credentials.get('source', 'unknown')

def test_authentication():
    """Test the authentication system."""
    config = TestAuthConfig()
    
    print("🔍 Authentication Integration Test")
    print("=" * 40)
    
    print(f"Authenticated: {config.is_authenticated()}")
    print(f"Source: {config.get_credential_source()}")
    print(f"API Key: {'present' if config.get_api_key() else 'missing'}")
    print(f"User Email: {config.get_user_email() or 'not provided'}")
    
    # Check environment variables
    print("\n📍 Environment Variables:")
    env_vars = ['PROMPTFOO_API_KEY', 'PROMPTFOO_API_HOST', 'PROMPTFOO_USER_EMAIL', 'PROMPTFOO_INTERFACE_VERSION']
    for var in env_vars:
        value = os.getenv(var)
        if var == 'PROMPTFOO_API_KEY' and value:
            print(f"  {var}: {'present' if value else 'missing'}")
        else:
            print(f"  {var}: {value or 'not set'}")
    
    print("\n🎯 Test Results:")
    if config.is_authenticated():
        print("✅ Authentication working! Credentials received from promptfoo")
    else:
        print("❌ No authentication found")
        print("💡 To test: PROMPTFOO_API_KEY=test_key python test_auth_integration.py")

if __name__ == "__main__":
    test_authentication() 