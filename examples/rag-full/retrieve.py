import logging
import os
from typing import Any, Dict, List, Tuple

from langchain.prompts import ChatPromptTemplate
from langchain.schema import AIMessage, HumanMessage
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

# Constants
CHROMA_PATH: str = "db"
OPENAI_AI_MODEL: str = "gpt-4o-mini"
OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
OPENAI_AI_EMBEDDING_MODEL: str = "text-embedding-3-large"

# Initialize embeddings and load the Chroma database
embeddings: OpenAIEmbeddings = OpenAIEmbeddings(
    model=OPENAI_AI_EMBEDDING_MODEL, openai_api_key=OPENAI_API_KEY
)
db_chroma: Chroma = Chroma(
    collection_name="rag_collection",
    persist_directory=CHROMA_PATH,
    embedding_function=embeddings,
)

# Prompt template for generating answers
PROMPT_TEMPLATE: str = """
Answer the question based only on the following context:
{context}
Answer the question based on the above context: {question}.
Provide a detailed answer.
Don't justify your answers.
Don't give information not mentioned in the CONTEXT INFORMATION.
Do not say "according to the context" or "mentioned in the context" or similar.
"""


def call_api(
    prompt: str, options: Dict[str, Any], context: Dict[str, Any]
) -> Dict[str, str]:
    """
    Process a prompt using RAG and return the response.

    Args:
        prompt: The user's question or prompt
        options: Configuration options including topK
        context: Additional context for the request

    Returns:
        Dict containing the model's response

    Raises:
        Exception: If there's an error during processing
    """
    try:
        k: int = options.get("config", {}).get("topK", 5)
        docs_chroma: List[Tuple[Document, float]] = (
            db_chroma.similarity_search_with_score(
                prompt,
                k=k,
            )
        )
        context_text: str = "\n\n".join(
            [doc.page_content for doc, _score in docs_chroma]
        )

        # Generate prompt using the template
        prompt_template: ChatPromptTemplate = ChatPromptTemplate.from_template(
            PROMPT_TEMPLATE
        )
        final_prompt: str = prompt_template.format(
            context=context_text, question=prompt
        )

        # Fetch from OpenAI API
        chat: ChatOpenAI = ChatOpenAI(
            model_name=OPENAI_AI_MODEL, temperature=0, openai_api_key=OPENAI_API_KEY
        )
        message: HumanMessage = HumanMessage(content=final_prompt)
        response: AIMessage = chat.invoke([message])

        result: Dict[str, str] = {
            "output": response.content,
        }

        return result
    except Exception as e:
        logging.error(f"Error in call_api: {str(e)}")
        raise
