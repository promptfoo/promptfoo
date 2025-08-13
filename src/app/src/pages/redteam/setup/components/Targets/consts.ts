export const AGENT_FRAMEWORKS = [
  'langchain',
  'autogen',
  'crewai',
  'llamaindex',
  'langgraph',
  'openai-agents-sdk',
  'pydantic-ai',
  'google-adk',
  'generic-agent',
];

export const AGENT_TEMPLATES: Record<string, string> = {
  langchain: `import os
from langchain.agents import create_react_agent, AgentExecutor
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.tools import Tool

# Initialize the LLM
llm = ChatOpenAI(
    model="gpt-5",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7,
)

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The input prompt/query
        options: Additional options from promptfoo
        context: Evaluation context
    
    Returns:
        dict: Response with 'output' key
    """
    # Define tools if needed
    tools = []
    
    # Create a simple prompt template
    prompt_template = PromptTemplate(
        input_variables=["input", "agent_scratchpad"],
        template="""Answer the following question: {input}
        
        {agent_scratchpad}"""
    )
    
    # Create the agent
    agent = create_react_agent(
        llm=llm,
        tools=tools,
        prompt=prompt_template,
    )
    
    # Create an executor
    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        handle_parsing_errors=True,
    )
    
    # Run the agent
    result = agent_executor.invoke({"input": prompt})
    
    return {
        "output": result.get("output", "No response generated"),
    }
`,

  autogen: `import os
from autogen import AssistantAgent, UserProxyAgent, config_list_from_json

# Configure your AutoGen agents
config_list = [{
    "model": "gpt-5",
    "api_key": os.getenv("OPENAI_API_KEY"),
}]

llm_config = {
    "config_list": config_list,
    "temperature": 0.7,
}

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The input prompt/query
        options: Additional options from promptfoo
        context: Evaluation context
    
    Returns:
        dict: Response with 'output' key
    """
    # Create agents
    assistant = AssistantAgent(
        name="assistant",
        llm_config=llm_config,
        system_message="You are a helpful AI assistant.",
    )
    
    user_proxy = UserProxyAgent(
        name="user_proxy",
        human_input_mode="NEVER",
        max_consecutive_auto_reply=1,
        code_execution_config=False,
    )
    
    # Initiate chat
    user_proxy.initiate_chat(
        assistant,
        message=prompt,
    )
    
    # Get the last message from the conversation
    last_message = user_proxy.last_message()
    
    return {
        "output": last_message["content"] if last_message else "No response generated",
    }
`,

  crewai: `import os
from crewai import Agent, Task, Crew

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The input prompt/query
        options: Additional options from promptfoo
        context: Evaluation context
    
    Returns:
        dict: Response with 'output' key
    """
    # Define your agent
    researcher = Agent(
        role='Researcher',
        goal='Provide accurate and helpful responses',
        backstory='You are an expert researcher with deep knowledge',
        verbose=True,
        allow_delegation=False,
    )
    
    # Create a task
    task = Task(
        description=prompt,
        agent=researcher,
        expected_output='A comprehensive response to the query',
    )
    
    # Create and run the crew
    crew = Crew(
        agents=[researcher],
        tasks=[task],
        verbose=False,
    )
    
    result = crew.kickoff()
    
    return {
        "output": str(result),
    }
`,

  llamaindex: `import os
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Document, Settings
from llama_index.llms.openai import OpenAI
from llama_index.core.agent import ReActAgent
from llama_index.core.tools import QueryEngineTool, ToolMetadata

# Configure LlamaIndex settings
Settings.llm = OpenAI(model="gpt-5", api_key=os.getenv("OPENAI_API_KEY"))

def create_agent_with_tools():
    """Create a LlamaIndex agent with RAG capabilities."""
    
    # Create sample documents for the index
    # In production, you'd load actual documents
    documents = [
        Document(text="This is a sample document for the knowledge base."),
        Document(text="You can add multiple documents to build your RAG system."),
    ]
    
    # Build vector index
    index = VectorStoreIndex.from_documents(documents)
    
    # Create a query engine from the index
    query_engine = index.as_query_engine(similarity_top_k=3)
    
    # Create tools for the agent
    query_tool = QueryEngineTool(
        query_engine=query_engine,
        metadata=ToolMetadata(
            name="knowledge_base",
            description="Search the knowledge base for relevant information",
        ),
    )
    
    # Create the ReAct agent with tools
    agent = ReActAgent.from_tools(
        tools=[query_tool],
        llm=Settings.llm,
        verbose=True,
    )
    
    return agent

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The input prompt/query
        options: Additional options from promptfoo
        context: Evaluation context
    
    Returns:
        dict: Response with 'output' key
    """
    try:
        # Create the agent with tools
        agent = create_agent_with_tools()
        
        # Run the agent with the prompt
        response = agent.chat(prompt)
        
        # Extract the response
        output = str(response)
        
        return {
            "output": output,
        }
        
    except Exception as e:
        return {
            "error": f"Error processing request: {str(e)}"
        }
`,

  langgraph: `import os
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage

# Define the state
class State(TypedDict):
    messages: list

# Initialize the LLM
llm = ChatOpenAI(
    model="gpt-5",
    api_key=os.getenv("OPENAI_API_KEY"),
)

def agent(state: State):
    """Process messages with the LLM"""
    response = llm.invoke(state["messages"])
    return {"messages": state["messages"] + [response]}

# Build the graph
workflow = StateGraph(State)
workflow.add_node("agent", agent)
workflow.set_entry_point("agent")
workflow.add_edge("agent", END)

app = workflow.compile()

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The input prompt/query
        options: Additional options from promptfoo
        context: Evaluation context
    
    Returns:
        dict: Response with 'output' key
    """
    initial_state = {
        "messages": [HumanMessage(content=prompt)]
    }
    
    result = app.invoke(initial_state)
    
    # Extract the last AI message
    last_message = result["messages"][-1]
    
    return {
        "output": last_message.content,
    }
`,

  'openai-agents-sdk': `import os
from swarm import Swarm, Agent
from swarm.types import ContextVariables

# Initialize Swarm client (OpenAI's agent framework)
client = Swarm()

# Define your agent with tools and behaviors
def create_agent():
    """Create an OpenAI agent with specific instructions and tools."""
    
    # Define tools/functions the agent can use
    def get_weather(location: str) -> str:
        """Mock weather function - replace with actual implementation."""
        return f"The weather in {location} is sunny and 72°F"
    
    def search_web(query: str) -> str:
        """Mock search function - replace with actual implementation."""
        return f"Search results for: {query}"
    
    # Create the agent with instructions and tools
    agent = Agent(
        name="Assistant",
        instructions="""You are a helpful AI assistant.
        Use the available tools when needed to provide accurate information.
        Be concise and helpful in your responses.""",
        model="gpt-5",
        functions=[get_weather, search_web],  # Add your tools here
    )
    
    return agent

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The input prompt/query
        options: Additional options from promptfoo
        context: Evaluation context
    
    Returns:
        dict: Response with 'output' key
    """
    # Create the agent
    agent = create_agent()
    
    # Initialize context variables if needed
    context_vars = ContextVariables()
    # Add any context variables: context_vars["key"] = value
    
    # Run the agent with the prompt
    response = client.run(
        agent=agent,
        messages=[{"role": "user", "content": prompt}],
        context_variables=context_vars,
    )
    
    # Extract the response
    if response.messages:
        output = response.messages[-1]["content"]
    else:
        output = "No response generated"
    
    return {
        "output": output,
    }
`,

  'pydantic-ai': `import os
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from typing import Optional

# Define structured output models
class AnalysisResult(BaseModel):
    """Structured output for analysis tasks."""
    summary: str = Field(description="Brief summary of the analysis")
    key_points: list[str] = Field(description="Key points from the analysis")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence score")
    recommendations: Optional[list[str]] = Field(default=None, description="Optional recommendations")

class QueryResponse(BaseModel):
    """General structured response."""
    answer: str = Field(description="The main answer to the query")
    reasoning: Optional[str] = Field(default=None, description="Reasoning behind the answer")
    sources: Optional[list[str]] = Field(default=None, description="Sources used")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

# Create the agent with structured output
agent = Agent(
    "gpt-5",
    result_type=QueryResponse,
    system_prompt="""You are a helpful AI assistant that provides structured, accurate responses.
    Always provide clear answers with your reasoning when applicable.
    Be concise but comprehensive.""",
)

# Create a specialized analysis agent
analysis_agent = Agent(
    "gpt-5",
    result_type=AnalysisResult,
    system_prompt="You are an expert analyst. Provide detailed analysis with key points and recommendations.",
)

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The input prompt/query
        options: Additional options from promptfoo
        context: Evaluation context
    
    Returns:
        dict: Response with 'output' key
    """
    try:
        # Determine which agent to use based on the prompt
        if any(keyword in prompt.lower() for keyword in ['analyze', 'analysis', 'evaluate', 'assess']):
            # Use analysis agent for analytical tasks
            result = analysis_agent.run_sync(prompt)
            
            if result.data:
                # Format the structured output
                output_parts = [result.data.summary]
                
                if result.data.key_points:
                    output_parts.append("\\nKey Points:")
                    for point in result.data.key_points:
                        output_parts.append(f"- {point}")
                
                if result.data.recommendations:
                    output_parts.append("\\nRecommendations:")
                    for rec in result.data.recommendations:
                        output_parts.append(f"- {rec}")
                
                output = "\\n".join(output_parts)
            else:
                output = "No analysis generated"
        else:
            # Use general agent for other queries
            result = agent.run_sync(prompt)
            
            if result.data:
                output_parts = [result.data.answer]
                
                if result.data.reasoning:
                    output_parts.append(f"\\nReasoning: {result.data.reasoning}")
                
                if result.data.sources:
                    output_parts.append("\\nSources:")
                    for source in result.data.sources:
                        output_parts.append(f"- {source}")
                
                output = "\\n".join(output_parts)
            else:
                output = "No response generated"
        
        return {
            "output": output,
            # Optional: Include confidence score if available
            "metadata": {
                "confidence": result.data.confidence if result.data else 0.0
            }
        }
        
    except Exception as e:
        return {
            "error": f"Error processing request: {str(e)}"
        }
`,

  'google-adk': `import os
from google import genai
from google.genai import types

# Configure Google's Generative AI
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

# Initialize the client
client = genai.Client()

def create_agent():
    """Create a Google ADK agent with tools and configuration."""
    
    # Define tools/functions for the agent
    def search_knowledge_base(query: str) -> str:
        """Search internal knowledge base."""
        # TODO: Implement your knowledge base search
        return f"Knowledge base results for: {query}"
    
    def analyze_data(data: str) -> str:
        """Analyze provided data."""
        # TODO: Implement your data analysis
        return f"Analysis of: {data}"
    
    # Register tools with the agent
    tools = [
        types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="search_knowledge_base",
                    description="Search the knowledge base",
                    parameters={
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Search query"}
                        },
                        "required": ["query"]
                    }
                ),
                types.FunctionDeclaration(
                    name="analyze_data",
                    description="Analyze provided data",
                    parameters={
                        "type": "object",
                        "properties": {
                            "data": {"type": "string", "description": "Data to analyze"}
                        },
                        "required": ["data"]
                    }
                )
            ]
        )
    ]
    
    return tools

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The input prompt/query
        options: Additional options from promptfoo
        context: Evaluation context
    
    Returns:
        dict: Response with 'output' key
    """
    # Get tools for the agent
    tools = create_agent()
    
    # Create a chat session with tools
    chat = client.chats.create(
        model="gemini-2.0-flash-exp",  # or another Google model
        config=types.GenerateContentConfig(
            tools=tools,
            temperature=0.7,
        )
    )
    
    # Send the prompt and get response
    response = chat.send_message(prompt)
    
    # Handle tool calls if any
    while response.candidates[0].content.parts[0].function_call:
        # Extract function call
        function_call = response.candidates[0].content.parts[0].function_call
        
        # Execute the function (you'd implement the actual function logic)
        if function_call.name == "search_knowledge_base":
            result = f"Results for: {function_call.args.get('query', '')}"
        elif function_call.name == "analyze_data":
            result = f"Analysis of: {function_call.args.get('data', '')}"
        else:
            result = "Function not implemented"
        
        # Send function result back
        response = chat.send_message(
            types.Content(
                parts=[types.Part(function_response=types.FunctionResponse(
                    name=function_call.name,
                    response={"result": result}
                ))]
            )
        )
    
    # Extract the final response
    output = response.text if hasattr(response, 'text') else str(response)
    
    return {
        "output": output,
    }
`,

  'generic-agent': `import os

"""
GENERIC AGENT TEMPLATE FOR PROMPTFOO

This template provides a flexible foundation for integrating ANY agent framework
with promptfoo. Promptfoo is fully customizable and supports all Python-based
agent frameworks through this standard interface.

Whether you're using:
- A proprietary agent framework
- A custom-built agent system
- A framework not listed in our presets
- A hybrid approach combining multiple frameworks

Simply implement the call_api function below to bridge your agent with promptfoo's
evaluation system.
"""

# TODO: Import your agent framework libraries here
# Examples:
# - from your_framework import Agent
# - from company_internal.agents import CustomAgent  
# - import proprietary_agent_sdk

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    This is the ONLY function you need to implement. Promptfoo will call this
    function with test prompts and evaluate the responses.
    
    Args:
        prompt (str): The input prompt/query from promptfoo
        options (dict): Additional options from promptfoo config
        context (dict): Evaluation context including test variables
    
    Returns:
        dict: Must contain an 'output' key with your agent's response
              Can optionally include 'error' for error handling
              Can optionally include 'tokenUsage' for token tracking
    
    Example return values:
        {"output": "Agent response text"}
        {"output": "Response", "tokenUsage": {"total": 150, "prompt": 50, "completion": 100}}
        {"error": "Error message"} 
    """
    
    # TODO: Initialize your agent
    # Example:
    # agent = YourAgent(
    #     model="gpt-5",
    #     temperature=0.7,
    #     # ... your agent configuration
    # )
    
    # TODO: Process the prompt with your agent
    # Example:
    # response = agent.process(prompt)
    # 
    # Or for stateful agents:
    # agent.add_message({"role": "user", "content": prompt})
    # response = agent.get_response()
    
    # TODO: Extract and return the response
    # Make sure to return a dict with 'output' key
    
    # Placeholder implementation - replace with your actual agent code
    response = f"[Your agent response to: {prompt}]"
    
    return {
        "output": response,
        # Optional: Include token usage if your agent tracks it
        # "tokenUsage": {
        #     "total": 100,
        #     "prompt": 30,
        #     "completion": 70
        # }
    }

# Optional: Add helper functions for your agent
def initialize_agent(config=None):
    """Helper function to initialize your agent with configuration."""
    pass

def process_with_tools(agent, prompt, tools=None):
    """Helper function if your agent uses tools/functions."""
    pass

def handle_conversation(agent, messages):
    """Helper function for multi-turn conversations."""
    pass
`,

  // Default template for frameworks without specific templates
  default: `import os

# TODO: Import your framework libraries here

def call_api(prompt, options, context):
    """
    Main entry point for promptfoo evaluation.
    
    Args:
        prompt: The input prompt/query from promptfoo
        options: Additional options from promptfoo config
        context: Evaluation context including vars
    
    Returns:
        dict: Response with 'output' key containing the agent's response
    """
    # TODO: Initialize your agent here
    
    # TODO: Process the prompt with your agent
    
    # TODO: Return the response
    response = f"Response from agent: {prompt}"
    
    return {
        "output": response,
    }
`,
};
