import os
import sys

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_openai import OpenAI

llm = OpenAI(temperature=0, api_key=os.getenv("OPENAI_API_KEY"))
math_chain = (
    PromptTemplate.from_template(
        "Solve the following math problem carefully. Return only the final answer.\n\n{question}"
    )
    | llm
    | StrOutputParser()
)

prompt = sys.argv[1]
print(math_chain.invoke({"question": prompt}))
