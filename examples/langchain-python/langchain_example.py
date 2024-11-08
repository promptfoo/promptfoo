import os
import sys

from langchain.chains.llm_math.base import LLMMathChain
from langchain_openai import OpenAI

llm = OpenAI(temperature=0, api_key=os.getenv("OPENAI_API_KEY"))

llm_math = LLMMathChain.from_llm(llm=llm)


def call_api(prompt, options, context):
    return {
        "output": llm_math.run(prompt),
    }
