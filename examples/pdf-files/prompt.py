import base64
import typing


class Vars(typing.TypedDict):
    file_path: str


class Provider(typing.TypedDict):
    id: str


class PromptFunctionContext(typing.TypedDict):
    vars: Vars
    provider: Provider


def get_file_base64(local_file_path: str, mime_type: str) -> str:
    """
    Read a local file and convert it to a base64-encoded string.

    Args:
        local_file_path (str): The path to the local file.
        mime_type (str): The MIME type of the file (e.g., 'application/pdf').

    Returns:
        str: The base64-encoded file data.
    """
    with open(local_file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


system_prompt = "Count the number of diagrams on this page"


def format_pdf_prompt(context: PromptFunctionContext) -> list[dict[str, typing.Any]]:
    """
    Format the prompt for PDF analysis based on the AI provider.
    """
    provider_id = context["provider"]["id"]
    pdf_mime_type = "application/pdf"
    file_path = context["vars"]["file_path"]
    file_data = get_file_base64(file_path, pdf_mime_type)

    if provider_id.startswith("anthropic:"):
        return [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": pdf_mime_type,
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
                "content": [{"type": "input_text", "text": system_prompt}],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_file",
                        "filename": "file.pdf",
                        "file_data": f"data:{pdf_mime_type};base64,{file_data}",
                    }
                ],
            },
        ]
    if provider_id.startswith("google:"):
        return [
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": pdf_mime_type,
                            "data": file_data,
                        }
                    },
                    {"text": system_prompt},
                ]
            }
        ]

    raise ValueError(f"Unsupported provider: {context['provider']}")
