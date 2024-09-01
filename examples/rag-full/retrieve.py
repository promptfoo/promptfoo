import os

from langchain.prompts import ChatPromptTemplate
from langchain.schema import HumanMessage
from langchain_community.vectorstores import Chroma
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
CHROMA_PATH = "db"

# Initialize embeddings and load the Chroma database
embeddings = OpenAIEmbeddings(openai_api_key=OPENAI_API_KEY)
db_chroma = Chroma(persist_directory=CHROMA_PATH, embedding_function=embeddings)

# Prompt template for generating answers
PROMPT_TEMPLATE = """
Answer the question based only on the following context:
{context}
Answer the question based on the above context: {question}.
Provide a detailed answer.
Don't justify your answers.
Don't give information not mentioned in the CONTEXT INFORMATION.
Do not say "according to the context" or "mentioned in the context" or similar.
"""


def call_api(prompt, options, context):
    k = options.get("config", {}).get("topK", 5)
    docs_chroma = db_chroma.similarity_search_with_score(prompt, k=k)
    context_text = "\n\n".join([doc.page_content for doc, _score in docs_chroma])

    # Generate prompt using the template
    prompt_template = ChatPromptTemplate.from_template(PROMPT_TEMPLATE)
    final_prompt = prompt_template.format(context=context_text, question=prompt)

    # Fetch from OpenAI API
    chat = ChatOpenAI(
        model_name="gpt-4o-mini", temperature=0, openai_api_key=OPENAI_API_KEY
    )
    message = HumanMessage(content=final_prompt)
    response = chat([message])

    result = {
        "output": response.content,
    }

    return result
