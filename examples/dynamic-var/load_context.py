"""
Dynamic variable loader for RAG-style context retrieval.

This script demonstrates how to dynamically load context based on other
variables in the test case. The `get_var` function receives:
  - var_name: The name of the variable being loaded (e.g., "context")
  - prompt: The prompt template
  - other_vars: A dictionary of other variables in the test case

This is useful for RAG applications where you need to retrieve relevant
documents based on the user's question.
"""

# Simulated document store - in practice, this would be a vector database
DOCUMENTS = {
    "parental": """
        Parental Leave Policy:
        - Primary caregivers: 16 weeks paid leave
        - Secondary caregivers: 4 weeks paid leave
        - Can be taken within 12 months of birth/adoption
        - Flexible return-to-work options available
    """,
    "vacation": """
        Vacation Policy:
        - New employees: 15 days per year
        - After 3 years: 20 days per year
        - After 5 years: 25 days per year
        - Unused days can roll over (max 5 days)
    """,
    "remote": """
        Remote Work Guidelines:
        - Hybrid model: 3 days in office, 2 days remote
        - Core hours: 10am-3pm in your timezone
        - Home office stipend: $500 one-time
        - VPN required for all remote access
    """,
}


def retrieve_documents(question: str) -> str:
    """
    Simulate RAG retrieval - find relevant documents for a question.

    In a real implementation, this would:
    1. Generate embeddings for the question
    2. Search a vector database
    3. Return the most relevant documents
    """
    question_lower = question.lower()

    # Simple keyword matching (in practice, use semantic search)
    for keyword, document in DOCUMENTS.items():
        if keyword in question_lower:
            return document.strip()

    return "No relevant documents found."


def get_var(var_name: str, prompt: str, other_vars: dict) -> dict:
    """
    Dynamic variable loader function.

    Args:
        var_name: Name of the variable being loaded ("context" in this case)
        prompt: The prompt template string
        other_vars: Dictionary containing other variables from the test case

    Returns:
        dict with 'output' key containing the variable value,
        or 'error' key if something went wrong
    """
    # Get the question from other variables
    question = other_vars.get("question", "")

    if not question:
        return {"error": "No question provided in test case"}

    # Retrieve relevant context based on the question
    context = retrieve_documents(question)

    return {"output": context}
