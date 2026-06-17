import os
import sys

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_openai import OpenAI

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY environment variable is required.")

llm = OpenAI(temperature=0, api_key=api_key)
math_chain = (
    PromptTemplate.from_template(
        "Solve the following math problem carefully. Return only the final answer.\n\n{question}"
    )
    | llm
    | StrOutputParser()
)

if len(sys.argv) < 2:
    print(f"Usage: {sys.argv[0]} <question>", file=sys.stderr)
    sys.exit(1)

prompt = sys.argv[1]
try:
    result = math_chain.invoke({"question": prompt})
    print(result)
except Exception as error:
    print(f"Error invoking math chain: {error}", file=sys.stderr)
    sys.exit(1)
