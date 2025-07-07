"""
LangChain ReAct agent with tools and reasoning
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../../shared'))

from langchain.agents import create_react_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.tools import Tool, StructuredTool
from langchain.prompts import PromptTemplate
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain.memory import ConversationBufferMemory
from tracing_utils import create_traced_provider
import json
import re

# Define tools
def calculator_tool(expression: str) -> str:
    """Evaluate mathematical expressions safely"""
    try:
        # Remove any dangerous operations
        safe_expr = re.sub(r'[^0-9+\-*/().\s]', '', expression)
        result = eval(safe_expr, {"__builtins__": {}})
        return f"Result: {result}"
    except Exception as e:
        return f"Error calculating: {str(e)}"

def code_interpreter_tool(code: str, language: str = "python") -> str:
    """Execute code snippets (simulated for safety)"""
    if language.lower() == "python":
        # Simulate Python execution
        if "print" in code:
            return "Output: Hello, World! (simulated)"
        elif "def" in code:
            return "Function defined successfully (simulated)"
        else:
            return "Code executed successfully (simulated)"
    return f"Language {language} not supported"

def search_tool(query: str) -> str:
    """Search for information (using mock data for demo)"""
    # In production, use TavilySearchResults or similar
    mock_results = {
        "nvidia": "NVIDIA (NVDA) current stock price: $875.32",
        "quantum computing": "Recent advances in quantum computing include Google's Willow chip achieving quantum supremacy",
        "microservices": "Best practices: service boundaries, API design, data consistency, monitoring",
    }
    
    query_lower = query.lower()
    for key, value in mock_results.items():
        if key in query_lower:
            return value
    
    return f"Search results for '{query}': No specific results found in mock data"

# Create tools list
tools = [
    Tool(
        name="Calculator",
        func=calculator_tool,
        description="Useful for mathematical calculations. Input should be a mathematical expression."
    ),
    Tool(
        name="Search",
        func=search_tool,
        description="Search for current information, news, stock prices, etc. Input should be a search query."
    ),
    Tool(
        name="CodeInterpreter",
        func=code_interpreter_tool,
        description="Execute code snippets. Input should be code and optionally the language."
    )
]

# ReAct prompt template
react_prompt = PromptTemplate.from_template("""Answer the following questions as best you can. You have access to the following tools:

{tools}

Use the following format:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question

Begin!

Question: {input}
Thought: {agent_scratchpad}""")

def react_agent_provider(prompt, options, context):
    """LangChain ReAct agent provider"""
    model_name = options.get("config", {}).get("model", "gpt-4.1")
    
    # Initialize LLM
    llm = ChatOpenAI(
        model=model_name,
        temperature=0,
        max_retries=3
    )
    
    # Create agent
    agent = create_react_agent(
        llm=llm,
        tools=tools,
        prompt=react_prompt
    )
    
    # Create agent executor
    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        max_iterations=5,
        handle_parsing_errors=True,
        return_intermediate_steps=True
    )
    
    try:
        # Run agent
        result = agent_executor.invoke({
            "input": prompt
        })
        
        # Extract output and metadata
        output = result.get("output", "")
        intermediate_steps = result.get("intermediate_steps", [])
        
        # Format tool usage information
        tool_calls = []
        for action, observation in intermediate_steps:
            tool_calls.append({
                "tool": action.tool,
                "input": action.tool_input,
                "output": observation
            })
        
        return {
            "output": output,
            "metadata": {
                "model": model_name,
                "tool_calls": tool_calls,
                "iterations": len(intermediate_steps)
            }
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "output": f"Error in ReAct agent: {str(e)}"
        }

# Export traced version
call_api = create_traced_provider(
    react_agent_provider,
    service_name="langchain-react",
    provider_type="langchain"
) 