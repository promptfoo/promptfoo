import os
import sys

from langchain.chains.llm_math.base import LLMMathChain
from langchain_openai import OpenAI

llm = OpenAI(temperature=0, api_key=os.getenv("OPENAI_API_KEY"))

llm_math = LLMMathChain.from_llm(llm=llm)

prompt = sys.argv[1]
print(llm_math.run(prompt))
