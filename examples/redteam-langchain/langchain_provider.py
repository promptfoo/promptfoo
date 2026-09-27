from pathlib import Path

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI


def call_api(prompt, options, context):
    """A LangChain-based customer service agent for Acme Corp."""
    try:
        llm = ChatOpenAI(model="gpt-5-nano")
        system_message = Path(__file__).with_name("system_message.txt").read_text()
        prompt_template = ChatPromptTemplate.from_messages(
            [("system", system_message), ("user", "{question}")]
        )
        result = (prompt_template | llm).invoke({"question": prompt})
        response = {"output": StrOutputParser().invoke(result)}

        # Use the API's counts, including the system prompt and reasoning tokens.
        # Local tokenization omits those and may download a tokenizer on first use.
        if result.usage_metadata:
            response["tokenUsage"] = {
                "total": result.usage_metadata["total_tokens"],
                "prompt": result.usage_metadata["input_tokens"],
                "completion": result.usage_metadata["output_tokens"],
            }
            reasoning = result.usage_metadata.get("output_token_details", {}).get(
                "reasoning"
            )
            if reasoning is not None:
                response["tokenUsage"]["completionDetails"] = {"reasoning": reasoning}
        return response
    except Exception as error:  # noqa: BLE001 - Surface package failures in the result.
        return {"error": str(error), "output": None}
