import asyncio
import os

from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph
from pydantic import BaseModel

# Load the OpenAI API key from environment variable
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


# Define the data structure (state) passed between nodes in the graph
class ResearchState(BaseModel):
    query: str  # The original research query
    raw_info: str = ""  # Raw fetched or mocked information
    summary: str = ""  # Final summarized result


# Function to create and return the research agent graph
def get_research_agent(model="gpt-4o"):
    # Initialize the OpenAI LLM with the specified model and API key
    llm = ChatOpenAI(model=model, api_key=OPENAI_API_KEY)

    # Create a stateful graph with ResearchState as the shared state type
    graph = StateGraph(ResearchState)

    # Node 1: Simulate a search function that populates raw_info
    def search_info(state: ResearchState) -> ResearchState:
        # TODO: Replace with real search API integration
        mock_info = f"(Mock) According to recent sources, the latest trends in {state.query} include X, Y, Z."
        return ResearchState(query=state.query, raw_info=mock_info)

    # Node 2: Use the LLM to summarize the raw_info content
    def summarize_info(state: ResearchState) -> ResearchState:
        prompt = f"Summarize the following:\n{state.raw_info}"
        response = llm.invoke(prompt)  # Call the LLM to get the summary
        return ResearchState(
            query=state.query, raw_info=state.raw_info, summary=response.content
        )

    # Node 3: Format the final summary for output
    def output_summary(state: ResearchState) -> ResearchState:
        final_summary = f"Research summary for '{state.query}': {state.summary}"
        return ResearchState(
            query=state.query, raw_info=state.raw_info, summary=final_summary
        )

    # Add nodes to the graph
    graph.add_node("search_info", search_info)
    graph.add_node("summarize_info", summarize_info)
    graph.add_node("output_summary", output_summary)

    # Define the flow between nodes (edges)
    graph.add_edge("search_info", "summarize_info")
    graph.add_edge("summarize_info", "output_summary")

    # Set the starting and ending points of the graph
    graph.set_entry_point("search_info")
    graph.set_finish_point("output_summary")

    # Compile the graph into an executable app
    return graph.compile()


# Function to run the research agent with a given query prompt
def run_research_agent(prompt):
    # Get the compiled graph application
    app = get_research_agent()
    # Run the asynchronous invocation and get the result
    result = asyncio.run(app.ainvoke(ResearchState(query=prompt)))
    return result
