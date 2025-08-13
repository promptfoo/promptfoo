import { useState } from 'react';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { ProviderOptions } from '../../types';

interface AgentFrameworkConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  agentType: string;
}

// Template generators for different frameworks
const getAgentTemplate = (framework: string, modelId: string = 'gpt-5'): string => {
  const templates: Record<string, string> = {
    autogen: `import os
from autogen import AssistantAgent, UserProxyAgent, config_list_from_json

# Configure your AutoGen agents
config_list = [{
    "model": "${modelId}",
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
        model="${modelId}",
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
    model="${modelId}",
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
    model="${modelId}",
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
    model="${modelId}",
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
    "${modelId}",
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

# TODO: Import your ${framework} framework libraries here
# Example: from ${framework} import Agent

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
    # TODO: Initialize your ${framework} agent here
    
    # TODO: Process the prompt with your agent
    
    # TODO: Return the response
    response = f"Response from ${framework} agent: {prompt}"
    
    return {
        "output": response,
    }
`,
  };

  return templates[framework] || templates.default.replace(/\${framework}/g, framework);
};

const frameworkInfo: Record<string, { name: string; description: string; pip: string }> = {
  autogen: {
    name: 'AutoGen',
    description: 'Multi-agent collaborative framework from Microsoft',
    pip: 'pyautogen',
  },
  swarm: {
    name: 'Swarm',
    description: 'Lightweight multi-agent orchestration from OpenAI',
    pip: 'git+https://github.com/openai/swarm.git',
  },
  crewai: {
    name: 'CrewAI',
    description: 'Framework for orchestrating role-playing autonomous AI agents',
    pip: 'crewai',
  },
  langgraph: {
    name: 'LangGraph',
    description: 'Build stateful multi-agent applications with LangChain',
    pip: 'langgraph langchain-openai',
  },
  llamaindex: {
    name: 'LlamaIndex',
    description: 'Data framework for LLM-based applications with RAG',
    pip: 'llama-index',
  },
  dspy: {
    name: 'DSPy',
    description: 'Framework for algorithmically optimizing LM prompts',
    pip: 'dspy-ai',
  },
  'pydantic-ai': {
    name: 'Pydantic AI',
    description: 'Agent framework with structured outputs using Pydantic',
    pip: 'pydantic-ai',
  },
  beeai: {
    name: 'BeeAI Framework',
    description: 'Production-ready multi-agent systems from IBM',
    pip: 'beeai-framework',
  },
  gptswarm: {
    name: 'GPTSwarm',
    description: 'Graph-based framework with RL and prompt optimization',
    pip: 'gptswarm',
  },
  'swarms-framework': {
    name: 'Swarms Framework',
    description: 'Enterprise-grade multi-agent orchestration',
    pip: 'swarms',
  },
  'smol-agents': {
    name: 'SmolAgents',
    description: 'Lightweight framework for micro-agent deployment',
    pip: 'smol-agents',
  },
  letta: {
    name: 'Letta (MemGPT)',
    description: 'Framework for building modular AI agents with memory',
    pip: 'letta',
  },
};

export default function AgentFrameworkConfiguration({
  selectedTarget,
  updateCustomTarget,
  agentType,
}: AgentFrameworkConfigurationProps) {
  const [copied, setCopied] = useState(false);
  const defaultModel = 'gpt-5';

  const frameworkDetails = frameworkInfo[agentType] || {
    name: agentType,
    description: 'Agent framework',
    pip: agentType,
  };

  const handleCopyTemplate = () => {
    const template = getAgentTemplate(agentType, defaultModel);
    navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTemplate = () => {
    const template = getAgentTemplate(agentType, defaultModel);
    const blob = new Blob([template], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agentType}_agent.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          {frameworkDetails.name} Agent Configuration
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {frameworkDetails.description}
        </Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', mb: 1 }}>
          Install with: <strong>pip install {frameworkDetails.pip}</strong>
        </Typography>
      </Alert>

      <Stack spacing={3}>
        <TextField
          fullWidth
          label="Provider ID (Python file path)"
          value={selectedTarget.id || ''}
          onChange={(e) => updateCustomTarget('id', e.target.value)}
          placeholder={`file:///path/to/${agentType}_agent.py`}
          helperText="Path to your Python agent implementation file"
          required
        />

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            Generate Template File
          </Typography>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<ContentCopyIcon />}
              onClick={handleCopyTemplate}
              disabled={copied}
            >
              {copied ? 'Copied!' : 'Copy Template'}
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadTemplate}
            >
              Download {agentType}_agent.py
            </Button>
          </Stack>
        </Box>

        <Alert severity="warning">
          <Typography variant="body2">
            <strong>Next Steps:</strong>
          </Typography>
          <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            <li>Save the template to a Python file</li>
            <li>
              Install required dependencies: <code>pip install {frameworkDetails.pip}</code>
            </li>
            <li>
              Customize the agent logic in the <code>call_api</code> function
            </li>
            <li>Update the Provider ID field above with the file path</li>
          </ol>
        </Alert>
      </Stack>
    </Box>
  );
}
