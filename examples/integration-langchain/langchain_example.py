import os
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <question>", file=sys.stderr)
        return 1

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY environment variable is required.", file=sys.stderr)
        return 1

    # Validate CLI inputs before importing optional dependencies so usage and
    # configuration errors stay concise even before the example is installed.
    from langchain_core.output_parsers import StrOutputParser
    from langchain_core.prompts import PromptTemplate
    from langchain_openai import OpenAI

    llm = OpenAI(temperature=0, api_key=api_key)
    math_chain = (
        PromptTemplate.from_template(
            "Solve the following math problem carefully. Return only the final answer.\n\n{question}"
        )
        | llm
        | StrOutputParser()
    )

    try:
        result = math_chain.invoke({"question": sys.argv[1]})
    except Exception as error:
        print(f"Error invoking math chain: {error}", file=sys.stderr)
        return 1

    print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
