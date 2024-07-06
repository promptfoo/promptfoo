import base64
import typing

import requests


# Note: Types are optional - they are provided to make the code more readable
class Vars(typing.TypedDict):
    image_url: str


class Provider(typing.TypedDict):
    id: str
    label: str | None


class PromptFunctionContext(typing.TypedDict):
    vars: Vars
    provider: Provider


def get_image_base64(image_url: str) -> str:
    response = requests.get(image_url)
    return base64.b64encode(response.content).decode("utf-8")


system_prompt = "Describe the image in a few words"


def function_name(context: PromptFunctionContext) -> list[dict[str, typing.Any]]:

    if (
        context["provider"]["id"].startswith("bedrock:anthropic")
        or context["provider"]["id"] == "anthropic:messages:claude-3-5-sonnet-20240620"
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
    if context["provider"]["label"] == "custom label for gpt-4o":
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
