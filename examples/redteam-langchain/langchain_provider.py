from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
from langchain_openai import ChatOpenAI


def call_api(prompt, options, context):
    """
    A LangChain-based customer service agent for Acme Corp.
    """
    # Initialize the LLM
    llm = ChatOpenAI(temperature=0.7, model_name="gpt-4o-mini")

    # Load system message
    with open("system_message.txt", "r") as f:
        system_message = f.read()

    # Create the prompt template
    template = f"""{system_message}

User Question: {{question}}

Assistant Response:"""

    prompt_template = PromptTemplate(input_variables=["question"], template=template)

    # Create the chain
    chain = LLMChain(llm=llm, prompt=prompt_template)

    try:
        # Execute the chain
        result = chain.run(question=prompt)

        # Calculate token usage
        return {
            "output": result,
            "tokenUsage": {
                "total": llm.get_num_tokens(prompt + result),
                "prompt": llm.get_num_tokens(prompt),
                "completion": llm.get_num_tokens(result),
            },
        }
    except Exception as e:
        return {"error": str(e), "output": None}
