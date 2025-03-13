"""
PDF document ingestion script for RAG implementation.
Loads PDF files from a remote source in parallel, splits them into chunks,
and stores them in a Chroma vector database.
"""

from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote

from langchain.docstore.document import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import OpenAIEmbeddings
from tqdm import tqdm

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

# Constants
OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

CHROMA_PATH: str = "db"
BASE_URL: str = "https://storage.googleapis.com/promptfoo-public-1/examples/rag-sec/"
CHUNK_SIZE: int = 500
CHUNK_OVERLAP: int = 50
MAX_WORKERS: int = 5
OPENAI_AI_EMBEDDING_MODEL: str = "text-embedding-3-large"

# List of PDF files to process
PDF_FILES: List[str] = [
    "2022 Q3 AAPL.pdf",
    "2022 Q3 AMZN.pdf",
    "2022 Q3 INTC.pdf",
    "2022 Q3 MSFT.pdf",
    "2022 Q3 NVDA.pdf",
    "2023 Q1 AAPL.pdf",
    "2023 Q1 AMZN.pdf",
    "2023 Q1 INTC.pdf",
    "2023 Q1 MSFT.pdf",
    "2023 Q1 NVDA.pdf",
    "2023 Q2 AAPL.pdf",
    "2023 Q2 AMZN.pdf",
    "2023 Q2 INTC.pdf",
    "2023 Q2 MSFT.pdf",
    "2023 Q2 NVDA.pdf",
    "2023 Q3 AAPL.pdf",
    "2023 Q3 AMZN.pdf",
    "2023 Q3 INTC.pdf",
    "2023 Q3 MSFT.pdf",
    "2023 Q3 NVDA.pdf",
]


def process_single_pdf(pdf_file: str) -> Tuple[str, List[Document]]:
    """
    Process a single PDF file and return its chunks.

    Args:
        pdf_file: Name of the PDF file to process

    Returns:
        Tuple containing filename and list of document chunks
    """
    doc_url: str = BASE_URL + quote(pdf_file)
    try:
        loader: PyPDFLoader = PyPDFLoader(doc_url)
        pages: List[Document] = loader.load()
        text_splitter: RecursiveCharacterTextSplitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
        )
        chunks: List[Document] = text_splitter.split_documents(pages)
        return pdf_file, chunks
    except Exception as e:
        logging.error(f"Error processing {pdf_file}: {str(e)}")
        return pdf_file, []


def process_pdfs() -> List[Document]:
    """
    Process PDF files from the remote source in parallel and split them into chunks.

    Returns:
        List of document chunks
    """
    all_chunks: List[Document] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all PDF processing tasks
        future_to_pdf: Dict[
            concurrent.futures.Future[Tuple[str, List[Document]]], str
        ] = {
            executor.submit(process_single_pdf, pdf_file): pdf_file
            for pdf_file in PDF_FILES
        }

        # Process completed tasks with progress bar
        with tqdm(total=len(PDF_FILES), desc="Processing PDFs") as pbar:
            for future in as_completed(future_to_pdf):
                pdf_file: str = future_to_pdf[future]
                try:
                    _, chunks = future.result()
                    all_chunks.extend(chunks)
                    pbar.update(1)
                except Exception as e:
                    logging.error(f"Failed to process {pdf_file}: {str(e)}")
                    pbar.update(1)

    logging.info(f"Processed {len(all_chunks)} chunks from {len(PDF_FILES)} files")
    return all_chunks


def create_vector_store(chunks: List[Document], batch_size: int = 100) -> None:
    """
    Create and persist the vector store from document chunks in batches.

    Args:
        chunks: List of document chunks to embed
        batch_size: Number of documents to process in each batch
    """
    embeddings: OpenAIEmbeddings = OpenAIEmbeddings(
        model=OPENAI_AI_EMBEDDING_MODEL, openai_api_key=OPENAI_API_KEY
    )

    logging.info("Creating vector store...")

    # Process first batch
    current_batch: List[Document] = chunks[:batch_size]
    db: Chroma = Chroma.from_documents(
        current_batch,
        embeddings,
        persist_directory=CHROMA_PATH,
        collection_name="rag_collection",
    )

    # Process remaining batches
    with tqdm(
        total=len(chunks), initial=batch_size, desc="Embedding documents"
    ) as pbar:
        for i in range(batch_size, len(chunks), batch_size):
            current_batch = chunks[i : i + batch_size]
            db.add_documents(current_batch)
            pbar.update(len(current_batch))

    logging.info(f"Vector store created and persisted to {CHROMA_PATH}")


def main() -> None:
    """Main execution function."""
    chunks: List[Document] = process_pdfs()
    if chunks:
        create_vector_store(chunks)


if __name__ == "__main__":
    main()
