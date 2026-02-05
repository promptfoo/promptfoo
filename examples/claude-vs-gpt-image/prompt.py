import base64
import typing
from urllib.request import urlopen


# Type definitions for improved code readability
class Vars(typing.TypedDict):
    image_url: str


class Provider(typing.TypedDict):
    id: str
    label: typing.Optional[str]


class PromptFunctionContext(typing.TypedDict):
    vars: Vars
    provider: Provider


def get_image_base64(image_url: str) -> tuple[str, str]:
    """
    Fetch an image from a URL and convert it to a base64-encoded string.

    Args:
        image_url (str): The URL of the image to fetch.

    Returns:
        tuple[str, str]: The base64-encoded image data and media type.
    """
    with urlopen(image_url) as response:
        media_type = response.headers.get("Content-Type", "image/jpeg").split(";")[0]
        return base64.b64encode(response.read()).decode("utf-8"), media_type


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
    provider_id = context["provider"]["id"]
    if (
        provider_id.startswith("bedrock:anthropic")
        or provider_id.startswith("bedrock:us.anthropic")
        or provider_id.startswith("anthropic:")
    ):
        image_data, media_type = get_image_base64(context["vars"]["image_url"])
        return [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    }
                ],
            },
        ]
    if provider_id.startswith("google:gemini"):
        image_data, media_type = get_image_base64(context["vars"]["image_url"])
        return [
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": media_type,
                            "data": image_data,
                        }
                    },
                    {"text": system_prompt},
                ]
            }
        ]
    # label might not exist
    if context["provider"].get("label") == "custom label for gpt-4.1":
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
