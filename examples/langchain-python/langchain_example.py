import sys
import os

from langchain import OpenAI
from langchain.chains import LLMMathChain

llm = OpenAI(
    temperature=0,
    openai_api_key=os.getenv('OPENAI_API_KEY')
)

llm_math = LLMMathChain(llm=llm, verbose=True)

llm_math.run(sys.argv[1])
