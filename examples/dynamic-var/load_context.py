def retrieve_documents(question: str) -> str:
    # Calculate embeddings, search vector db...
    return f"<Documents similar to {question}>"


def get_var(var_name, prompt, other_vars):
    question = other_vars["question"]

    context = retrieve_documents(question)
    return {"output": context}

    # In case of error:
    # return {
    #     'error': 'Error message'
    # }
