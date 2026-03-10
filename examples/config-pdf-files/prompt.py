import base64
import os
import typing

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


class Vars(typing.TypedDict):
    file_path: str


class Provider(typing.TypedDict):
    id: str


class PromptFunctionContext(typing.TypedDict):
    vars: Vars
    provider: Provider


def get_file_base64(file_path: str) -> str:
    """
    Read a local file and convert it to a base64-encoded string.

    Args:
        file_path: Path to the file (relative to this script's directory).

    Returns:
        The base64-encoded file data.
    """
    resolved_path = os.path.join(SCRIPT_DIR, file_path)
    with open(resolved_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


SYSTEM_PROMPT = "Count the number of diagrams on this page"
PDF_MIME_TYPE = "application/pdf"


def format_pdf_prompt(context: PromptFunctionContext) -> list[dict[str, typing.Any]]:
    """
    Format the prompt for PDF analysis based on the AI provider.

    Each provider has a different format for sending PDF documents.
    This function handles the provider-specific formatting.

    Args:
        context: Dictionary containing provider info and variables.

    Returns:
        Formatted prompt as a list of message dictionaries.

    Raises:
        ValueError: If an unsupported provider is specified.
    """
    provider_id = context["provider"]["id"]
    file_path = context["vars"]["file_path"]
    file_data = get_file_base64(file_path)

    if provider_id.startswith("anthropic:"):
        return [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": PDF_MIME_TYPE,
                            "data": file_data,
                        },
                    }
                ],
            },
        ]

    if provider_id.startswith("openai:"):
        return [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": SYSTEM_PROMPT}],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_file",
                        "filename": "document.pdf",
                        "file_data": f"data:{PDF_MIME_TYPE};base64,{file_data}",
                    }
                ],
            },
        ]

    if provider_id.startswith("google:") or provider_id.startswith("vertex:"):
        return [
            {
                "role": "user",
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": PDF_MIME_TYPE,
                            "data": file_data,
                        }
                    },
                    {"text": SYSTEM_PROMPT},
                ],
            }
        ]

    raise ValueError(f"Unsupported provider: {provider_id}")
