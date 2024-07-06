import json
import sys
import os

from langchain import OpenAI
from langchain.chains import LLMMathChain

llm = OpenAI(temperature=0, openai_api_key=os.getenv("OPENAI_API_KEY"))

llm_math = LLMMathChain(llm=llm, verbose=True)

prompt = sys.argv[1]
provider_options = json.loads(sys.argv[2])
test_context = json.loads(sys.argv[3])

# print("Vars: ", test_context['vars'])

llm_math.run(prompt)
