import os

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
CHROMA_PATH = "db"

# Base URL for the PDF files
BASE_URL = "https://storage.googleapis.com/promptfoo-public-1/examples/rag-sec/"

# List of PDF files to process
pdf_files = [
    "2022 Q3 AAPL.pdf",
    "2022 Q3 NVDA.pdf",
    "2023 Q1 MSFT.pdf",
    "2023 Q2 INTC.pdf",
    "2023 Q3 AMZN.pdf",
    "2022 Q3 AMZN.pdf",
    "2023 Q1 AAPL.pdf",
    "2023 Q1 NVDA.pdf",
    "2023 Q2 MSFT.pdf",
    "2023 Q3 INTC.pdf",
    "2022 Q3 INTC.pdf",
    "2023 Q1 AMZN.pdf",
    "2023 Q2 AAPL.pdf",
    "2023 Q2 NVDA.pdf",
    "2023 Q3 MSFT.pdf",
    "2022 Q3 MSFT.pdf",
    "2023 Q1 INTC.pdf",
    "2023 Q2 AMZN.pdf",
    "2023 Q3 AAPL.pdf",
    "2023 Q3 NVDA.pdf",
]

# Initialize text splitter and embeddings
text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
embeddings = OpenAIEmbeddings(openai_api_key=OPENAI_API_KEY)

all_chunks = []

# Process each PDF file
for pdf_file in pdf_files:
    print(f"Ingesting {pdf_file}...")
    doc_url = BASE_URL + pdf_file.replace(" ", "%20")

    # Load PDF document from URL
    loader = PyPDFLoader(doc_url)
    pages = loader.load()

    # Split the document into chunks
    chunks = text_splitter.split_documents(pages)
    all_chunks.extend(chunks)

# Embed all chunks and load them into the database
db_chroma = Chroma.from_documents(all_chunks, embeddings, persist_directory=CHROMA_PATH)
