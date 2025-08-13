export const AGENT_FRAMEWORKS = [
  'autogen',
  'swarm',
  'crewai',
  'langgraph',
  'llamaindex',
  'dspy',
  'pydantic-ai',
  'beeai',
  'gptswarm',
  'swarms-framework',
  'smol-agents',
  'letta',
];

export const AGENT_TEMPLATES: Record<string, string> = {
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

  swarm: `import os
from swarm import Swarm, Agent

# Initialize Swarm client
client = Swarm()

# Define your agent
def create_agent():
    return Agent(
        name="Assistant",
        instructions="You are a helpful AI assistant.",
        model="gpt-5",
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
    agent = create_agent()
    
    response = client.run(
        agent=agent,
        messages=[{"role": "user", "content": prompt}],
    )
    
    return {
        "output": response.messages[-1]["content"],
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

  llamaindex: `import os
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Document
from llama_index.llms.openai import OpenAI

# Initialize LLM
llm = OpenAI(
    model="gpt-5",
    api_key=os.getenv("OPENAI_API_KEY"),
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
    # Create a simple document for demonstration
    # In production, you'd load actual documents
    documents = [Document(text="This is a sample document for the index.")]
    
    # Build index
    index = VectorStoreIndex.from_documents(
        documents,
        llm=llm,
    )
    
    # Query the index
    query_engine = index.as_query_engine()
    response = query_engine.query(prompt)
    
    return {
        "output": str(response),
    }
`,

  dspy: `import os
import dspy
from dspy.teleprompt import BootstrapFewShot

# Configure DSPy
lm = dspy.OpenAI(
    model="gpt-5",
    api_key=os.getenv("OPENAI_API_KEY"),
)
dspy.settings.configure(lm=lm)

class BasicQA(dspy.Signature):
    """Answer questions with short responses."""
    question = dspy.InputField()
    answer = dspy.OutputField(desc="short answer")

class SimpleAgent(dspy.Module):
    def __init__(self):
        super().__init__()
        self.generate_answer = dspy.ChainOfThought(BasicQA)
    
    def forward(self, question):
        return self.generate_answer(question=question)

# Initialize the agent
agent = SimpleAgent()

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
    result = agent(prompt)
    
    return {
        "output": result.answer,
    }
`,

  'pydantic-ai': `import os
from pydantic_ai import Agent
from pydantic import BaseModel

# Define your output model
class Response(BaseModel):
    answer: str
    confidence: float = 1.0

# Create the agent
agent = Agent(
    "gpt-5",
    result_type=Response,
    system_prompt="You are a helpful AI assistant.",
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
    result = agent.run_sync(prompt)
    
    return {
        "output": result.data.answer if result.data else "No response generated",
    }
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
