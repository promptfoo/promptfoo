"""Authentication client for ModelAudit using promptfoo's authentication system."""

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
                    f"HTTP Status: {response.status_code} - {response.reason}"
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
