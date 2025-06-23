"""Layered authentication system for ModelAudit."""

import os
from typing import Optional, Tuple

class LayeredAuthConfig:
    """Authentication config that receives credentials from promptfoo."""
    
    def __init__(self):
        self._credentials = self._load_credentials()

    def _load_credentials(self) -> dict:
        """Load credentials using layered fallback approach."""
        # Layer 1: Promptfoo-provided credentials (highest priority)
        if os.getenv('PROMPTFOO_API_KEY'):
            return {
                'source': 'promptfoo_env',
                'api_key': os.getenv('PROMPTFOO_API_KEY'),
                'api_host': os.getenv('PROMPTFOO_API_HOST', 'https://api.promptfoo.app'),
                'user_email': os.getenv('PROMPTFOO_USER_EMAIL'),
                'app_url': os.getenv('PROMPTFOO_APP_URL', 'https://www.promptfoo.app'),
            }
        
        # Layer 2: Try promptfoo config file (would require pyyaml implementation)
        # TODO: Add promptfoo config file reading
        
        # Layer 3: Local config (placeholder for future local auth)
        return {
            'source': 'local',
            'api_key': None,
            'api_host': 'https://api.promptfoo.app',
            'user_email': None,
            'app_url': 'https://www.promptfoo.app'
        }

    def get_api_key(self) -> Optional[str]:
        """Get API key from loaded credentials."""
        return self._credentials.get('api_key')

    def get_api_host(self) -> str:
        """Get API host from loaded credentials."""
        return self._credentials.get('api_host', 'https://api.promptfoo.app')

    def get_user_email(self) -> Optional[str]:
        """Get user email from loaded credentials."""
        return self._credentials.get('user_email')

    def get_app_url(self) -> str:
        """Get app URL from loaded credentials."""
        return self._credentials.get('app_url', 'https://www.promptfoo.app')

    def is_authenticated(self) -> bool:
        """Check if user is authenticated."""
        return bool(self.get_api_key())

    def get_credential_source(self) -> str:
        """Get the source of current credentials."""
        return self._credentials.get('source', 'unknown')

    def get_auth_status(self) -> Tuple[bool, str]:
        """Get authentication status with detailed message."""
        if self.is_authenticated():
            source = self.get_credential_source()
            email = self.get_user_email()
            email_info = f" ({email})" if email else ""
            return True, f"Authenticated via {source}{email_info}"
        
        return False, "No authentication found. Run via promptfoo: promptfoo scan-model <path>"

# Global config instance
config = LayeredAuthConfig()

# Test function to verify the config works
if __name__ == "__main__":
    print(f"Config test: {config.get_auth_status()}")
    print(f"Source: {config.get_credential_source()}")
    print(f"Authenticated: {config.is_authenticated()}")
