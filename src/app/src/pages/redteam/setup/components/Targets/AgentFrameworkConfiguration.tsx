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
import { AGENT_TEMPLATES } from './consts';

import type { ProviderOptions } from '../../types';

interface AgentFrameworkConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  agentType: string;
}

// Template generators for different frameworks
const getAgentTemplate = (framework: string): string => {
  return AGENT_TEMPLATES[framework] || AGENT_TEMPLATES.default;
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

  const frameworkDetails = frameworkInfo[agentType] || {
    name: agentType,
    description: 'Agent framework',
    pip: agentType,
  };

  const handleCopyTemplate = () => {
    const template = getAgentTemplate(agentType);
    navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTemplate = () => {
    const template = getAgentTemplate(agentType);
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
