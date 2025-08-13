export const AGENT_FRAMEWORKS = [
  'langchain',
  'agentflow',
  'autogen',
  'semantic-kernel',
  'atomic-agents',
  'crewai',
  'rasa',
  'huggingface-agents',
  'langflow',
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

  agentflow: `import os
# AgentFlow is a hypothetical framework - adjust imports as needed
# from agentflow import Agent, Workflow

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
    # TODO: Initialize your AgentFlow agent
    # agent = Agent(
    #     name="Assistant",
    #     model="gpt-5",
    # )
    
    # TODO: Create and run workflow
    # workflow = Workflow(agent)
    # result = workflow.run(prompt)
    
    # Placeholder response
    response = f"AgentFlow response to: {prompt}"
    
    return {
        "output": response,
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

  'semantic-kernel': `import os
from semantic_kernel import Kernel
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion
from semantic_kernel.prompt_template import PromptTemplateConfig

# Initialize Semantic Kernel
kernel = Kernel()

# Add OpenAI service
kernel.add_chat_service(
    "chat-gpt",
    OpenAIChatCompletion(
        "gpt-5",
        api_key=os.getenv("OPENAI_API_KEY"),
    ),
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
    # Create a semantic function
    prompt_config = PromptTemplateConfig(
        template=prompt,
        description="Process user query",
    )
    
    # Create and invoke the function
    function = kernel.create_semantic_function(
        prompt_template=prompt,
        function_name="query",
        skill_name="main",
    )
    
    # Run the function
    result = kernel.run(function)
    
    return {
        "output": str(result),
    }
`,

  'atomic-agents': `import os
# Atomic Agents framework - adjust imports as needed
# from atomic_agents import Agent, Task

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
    # TODO: Initialize your Atomic Agent
    # agent = Agent(
    #     name="Assistant",
    #     capabilities=["reasoning", "analysis"],
    # )
    
    # TODO: Process the task
    # task = Task(description=prompt)
    # result = agent.execute(task)
    
    # Placeholder response
    response = f"Atomic Agents response to: {prompt}"
    
    return {
        "output": response,
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

  rasa: `import os
from rasa.core.agent import Agent
from rasa.core.interpreter import RasaNLUInterpreter

# Load your trained RASA model
# Note: You need to train your RASA model first
interpreter = RasaNLUInterpreter("./models/nlu")
agent = Agent.load("./models/dialogue", interpreter=interpreter)

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
    # Handle the message with RASA
    responses = agent.handle_message(prompt)
    
    # Combine all responses
    output = " ".join([r.get("text", "") for r in responses])
    
    return {
        "output": output if output else "No response generated",
    }
`,

  'huggingface-agents': `import os
from transformers import Tool, ReactCodeAgent, HfEngine

# Initialize the Hugging Face agent
engine = HfEngine(model="meta-llama/Llama-3.3-70B-Instruct")

# Create the agent
agent = ReactCodeAgent(
    tools=[],  # Add tools as needed
    llm_engine=engine,
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
    # Run the agent
    result = agent.run(prompt)
    
    return {
        "output": str(result),
    }
`,

  langflow: `import os
import requests

# Langflow API endpoint
# Update this to your Langflow instance URL
LANGFLOW_URL = "http://localhost:7860/api/v1/run"
FLOW_ID = "your-flow-id"

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
    # Prepare the request to Langflow
    payload = {
        "inputs": {
            "text": prompt
        }
    }
    
    # Make request to Langflow API
    response = requests.post(
        f"{LANGFLOW_URL}/{FLOW_ID}",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    
    if response.status_code == 200:
        result = response.json()
        output = result.get("outputs", {}).get("output", "No response")
    else:
        output = f"Error: {response.status_code}"
    
    return {
        "output": output,
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
