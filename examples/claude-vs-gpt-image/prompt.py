import base64
import typing

import requests


# Type definitions for improved code readability
class Vars(typing.TypedDict):
    image_url: str


class Provider(typing.TypedDict):
    id: str
    label: str | None


class PromptFunctionContext(typing.TypedDict):
    vars: Vars
    provider: Provider


def get_image_base64(image_url: str) -> str:
    """
    Fetch an image from a URL and convert it to a base64-encoded string.

    Args:
        image_url (str): The URL of the image to fetch.

    Returns:
        str: The base64-encoded image data.
    """
    response = requests.get(image_url)
    return base64.b64encode(response.content).decode("utf-8")


# System prompt for image description task
system_prompt = "Describe the image in a few words"


def format_image_prompt(context: PromptFunctionContext) -> list[dict[str, typing.Any]]:
    """
    Format the prompt for image analysis based on the AI provider.

    This function generates a formatted prompt for different AI providers,
    tailoring the structure based on the provider's requirements.

    Args:
        context (PromptFunctionContext): A dictionary containing provider information and variables.

    Returns:
        list[dict[str, typing.Any]]: A list of dictionaries representing the formatted prompt.

    Raises:
        ValueError: If an unsupported provider is specified.
    """
    if (
        context["provider"]["id"].startswith("bedrock:anthropic")
        or context["provider"]["id"] == "anthropic:messages:claude-3-5-sonnet-20241022"
    ):
        return [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": get_image_base64(context["vars"]["image_url"]),
                        },
                    }
                ],
            },
        ]
    # label might not exist
    if context["provider"].get("label") == "custom label for gpt-4o":
        return [
            {
                "role": "system",
                "content": [{"type": "text", "text": system_prompt}],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": context["vars"]["image_url"],
                        },
                    }
                ],
            },
        ]

    raise ValueError(f"Unsupported provider: {context['provider']}")
