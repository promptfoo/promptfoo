"""Load remote PDF pages with the metadata used by the RAG example."""

from datetime import datetime
from io import BytesIO

import requests
from langchain_core.documents import Document
from pypdf import PdfReader


def load_pdf_pages(
    url: str, *, timeout: tuple[float, float] = (10, 60)
) -> list[Document]:
    """Load pages with finite connection and read-inactivity timeouts, in seconds."""
    with requests.get(url, timeout=timeout) as response:
        if response.status_code != 200:
            raise ValueError(
                f"Check the url of your file; returned status code {response.status_code}"
            )
        pdf_bytes = response.content
    with BytesIO(pdf_bytes) as pdf_stream:
        reader = PdfReader(pdf_stream)
        raw = {"producer": "PyPDF", "creator": "PyPDF", "creationdate": ""}
        raw.update(reader.metadata or {})
        raw.update(source=url, total_pages=len(reader.pages))
        metadata = {}
        for original_key, original_value in raw.items():
            key = original_key.removeprefix("/").lower()
            value = (
                original_value
                if type(original_value) in (str, int)
                else str(original_value)
            )
            if key in ("creationdate", "moddate"):
                try:
                    value = datetime.strptime(
                        value.replace("'", ""), "D:%Y%m%d%H%M%S%z"
                    ).isoformat("T")
                except ValueError:
                    # Preserve unparseable date metadata as its original string.
                    pass
            elif key not in ("page_count", "file_path") and isinstance(value, str):
                value = value.strip()
            metadata[key] = value
            if key in ("page_count", "file_path"):
                metadata[{"page_count": "total_pages", "file_path": "source"}[key]] = (
                    value
                )
        labels = reader.page_labels
        return [
            Document(
                page_content=page.extract_text(extraction_mode="plain").strip(),
                metadata={**metadata, "page": index, "page_label": labels[index]},
            )
            for index, page in enumerate(reader.pages)
        ]
