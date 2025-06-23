#!/usr/bin/env python3
"""Script to create unified auth system that uses promptfoo's config."""

import os

# Create auth directory
os.makedirs('modelaudit/auth', exist_ok=True)

# Create __init__.py
init_content = '''"""Authentication module for ModelAudit using promptfoo's config system."""

from .client import AuthClient
from .config import PromptfooConfig

__all__ = ["AuthClient", "PromptfooConfig"]
'''

with open('modelaudit/auth/__init__.py', 'w') as f:
    f.write(init_content)

# Create config.py
config_content = '''"""Configuration management using promptfoo's global config system."""

import os
from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:
    raise ImportError(
        "pyyaml is required for authentication. Install with: pip install pyyaml"
    )


class PromptfooConfig:
    """Manages authentication by reading promptfoo's global config directly."""

    def __init__(self):
        """Initialize config manager using promptfoo's config directory."""
        self.config_dir = self._get_promptfoo_config_dir()
        self.config_file = self.config_dir / "promptfoo.yaml"
        self._config = self._load_config()

    def _get_promptfoo_config_dir(self) -> Path:
        """Get promptfoo's config directory path."""
        # Use same logic as promptfoo: PROMPTFOO_CONFIG_DIR or ~/.promptfoo
        config_dir = os.getenv('PROMPTFOO_CONFIG_DIR')
        if config_dir:
            return Path(config_dir)
        return Path.home() / '.promptfoo'

    def _load_config(self) -> dict:
        """Load configuration from promptfoo's global config file."""
        if not self.config_file.exists():
            return {}

        try:
            with open(self.config_file, 'r') as f:
                config = yaml.safe_load(f) or {}
                return config
        except (yaml.YAMLError, IOError):
            return {}

    def _save_config(self, config: dict) -> None:
        """Save configuration to promptfoo's global config file."""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        with open(self.config_file, 'w') as f:
            yaml.dump(config, f, default_flow_style=False)

    def _update_config_section(self, section: str, data: dict) -> None:
        """Update a specific section in the config."""
        current_config = self._load_config()
        if section not in current_config:
            current_config[section] = {}
        current_config[section].update(data)
        self._save_config(current_config)
        self._config = current_config

    def get_api_key(self) -> Optional[str]:
        """Get API key from promptfoo's cloud config."""
        cloud_config = self._config.get('cloud', {})
        return cloud_config.get('apiKey')

    def set_api_key(self, api_key: str) -> None:
        """Set API key in promptfoo's cloud config."""
        self._update_config_section('cloud', {'apiKey': api_key})

    def get_api_host(self) -> str:
        """Get API host from promptfoo's cloud config."""
        cloud_config = self._config.get('cloud', {})
        return cloud_config.get('apiHost', 'https://api.promptfoo.app')

    def set_api_host(self, api_host: str) -> None:
        """Set API host in promptfoo's cloud config."""
        self._update_config_section('cloud', {'apiHost': api_host})

    def get_user_email(self) -> Optional[str]:
        """Get user email from promptfoo's account config."""
        account_config = self._config.get('account', {})
        return account_config.get('email')

    def set_user_email(self, email: str) -> None:
        """Set user email in promptfoo's account config."""
        self._update_config_section('account', {'email': email})

    def get_app_url(self) -> str:
        """Get app URL from promptfoo's cloud config."""
        cloud_config = self._config.get('cloud', {})
        return cloud_config.get('appUrl', 'https://www.promptfoo.app')

    def set_app_url(self, app_url: str) -> None:
        """Set app URL in promptfoo's cloud config."""
        self._update_config_section('cloud', {'appUrl': app_url})

    def is_authenticated(self) -> bool:
        """Check if user is authenticated (has API key)."""
        return bool(self.get_api_key())

    def delete_cloud_config(self) -> None:
        """Delete cloud configuration (logout)."""
        current_config = self._load_config()
        if 'cloud' in current_config:
            current_config['cloud'] = {}
            self._save_config(current_config)
            self._config = current_config

    def reload(self) -> None:
        """Reload configuration from file."""
        self._config = self._load_config()


# Global config instance
config = PromptfooConfig()
'''

with open('modelaudit/auth/config.py', 'w') as f:
    f.write(config_content)

# Create client.py
client_content = '''"""Authentication client for ModelAudit using promptfoo's authentication system."""

import logging
from typing import Any, Dict

import requests

from .config import config

logger = logging.getLogger("modelaudit.auth")


class AuthClient:
    """Handles authentication API calls compatible with promptfoo."""

    def __init__(self):
        """Initialize auth client."""
        self.session = requests.Session()
        # Set a reasonable timeout
        self.session.timeout = 30

    def validate_and_set_api_token(
        self, token: str, api_host: str = None
    ) -> Dict[str, Any]:
        """
        Validate API token and set configuration.
        
        Mirrors promptfoo's CloudConfig.validateAndSetApiToken behavior.

        Args:
            token: API token to validate
            api_host: Optional API host URL

        Returns:
            Dictionary with user, organization, and app information

        Raises:
            requests.RequestException: If API call fails
            ValueError: If token is invalid
        """
        host = api_host or config.get_api_host()

        try:
            response = self.session.get(
                f"{host}/api/v1/users/me",
                headers={
                    "Authorization": f"Bearer {token}",
                    "User-Agent": "modelaudit-cli",
                },
            )

            if not response.ok:
                error_text = response.text
                logger.error(
                    f"Failed to validate API token: {error_text}. "
                    f"HTTP Status: {response.status_code} - {response.statusText}"
                )
                raise ValueError(f"Failed to validate API token: {response.reason}")

            data = response.json()
            user = data.get("user", {})
            organization = data.get("organization", {})
            app = data.get("app", {})

            # Store the validated credentials using promptfoo's config structure
            config.set_api_key(token)
            if api_host:
                config.set_api_host(api_host)
            if user.get("email"):
                config.set_user_email(user["email"])
            if app.get("url"):
                config.set_app_url(app["url"])

            logger.info("Successfully authenticated with promptfoo")

            return {"user": user, "organization": organization, "app": app}

        except requests.RequestException as e:
            logger.error(f"Failed to validate API token with host {host}: {str(e)}")
            raise

    def get_user_info(self) -> Dict[str, Any]:
        """
        Get current user information.

        Returns:
            Dictionary with user information

        Raises:
            ValueError: If not authenticated
            requests.RequestException: If API call fails
        """
        api_key = config.get_api_key()
        if not api_key:
            raise ValueError("Not authenticated. Please run 'modelaudit auth login' first.")

        api_host = config.get_api_host()

        try:
            response = self.session.get(
                f"{api_host}/api/v1/users/me",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "modelaudit-cli",
                },
            )

            if not response.ok:
                raise ValueError(f"Failed to get user info: {response.reason}")

            return response.json()

        except requests.RequestException as e:
            logger.error(f"Failed to get user info: {str(e)}")
            raise


# Global auth client instance
auth_client = AuthClient()
'''

with open('modelaudit/auth/client.py', 'w') as f:
    f.write(client_content)

print("✅ Unified authentication system created successfully!")
print("📁 Files created:")
print("   - modelaudit/auth/__init__.py")
print("   - modelaudit/auth/config.py") 
print("   - modelaudit/auth/client.py")
print("🔗 System now reads directly from promptfoo's ~/.promptfoo/promptfoo.yaml config!") 