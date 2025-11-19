from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI


def call_api(prompt, options, context):
    """
    A LangChain-based customer service agent for Acme Corp.
    """
    # Initialize the LLM
    llm = ChatOpenAI(model_name="gpt-5-nano")

    # Load system message
    import os

    script_dir = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(script_dir, "system_message.txt"), "r") as f:
        system_message = f.read()

    # Create the prompt template using ChatPromptTemplate
    prompt_template = ChatPromptTemplate.from_messages(
        [("system", system_message), ("user", "{question}")]
    )

    # Create the chain using LCEL
    chain = prompt_template | llm

    try:
        # Execute the chain
        result = chain.invoke({"question": prompt})

        # Extract text output
        output_text = result.content if hasattr(result, "content") else str(result)

        # Calculate token usage
        return {
            "output": output_text,
            "tokenUsage": {
                "total": llm.get_num_tokens(prompt + output_text),
                "prompt": llm.get_num_tokens(prompt),
                "completion": llm.get_num_tokens(output_text),
            },
        }
    except Exception as e:
        return {"error": str(e), "output": None}
