import { useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
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
  langchain: {
    name: 'LangChain',
    description: 'Framework for developing applications powered by language models',
    pip: 'langchain langchain-openai',
  },
  autogen: {
    name: 'AutoGen',
    description: 'Multi-agent collaborative framework from Microsoft',
    pip: 'pyautogen',
  },
  crewai: {
    name: 'CrewAI',
    description: 'Framework for orchestrating role-playing autonomous AI agents',
    pip: 'crewai',
  },
  llamaindex: {
    name: 'LlamaIndex',
    description: 'Data framework for LLM applications with RAG capabilities',
    pip: 'llama-index',
  },
  langgraph: {
    name: 'LangGraph',
    description: 'Build stateful, multi-actor applications with LLMs',
    pip: 'langgraph langchain-openai',
  },
  'openai-agents-sdk': {
    name: 'OpenAI Agents SDK',
    description: 'Official OpenAI SDK for building AI agents with Swarm',
    pip: 'git+https://github.com/openai/swarm.git',
  },
  'pydantic-ai': {
    name: 'PydanticAI',
    description: 'Type-safe AI agents with structured outputs using Pydantic',
    pip: 'pydantic-ai',
  },
  'google-adk': {
    name: "Google's ADK",
    description: 'Google AI Development Kit for building agents with Gemini',
    pip: 'google-genai',
  },
  'generic-agent': {
    name: 'Custom Agent',
    description:
      'Any agent framework - promptfoo is fully customizable and supports all agent frameworks',
    pip: '# Install your agent framework dependencies',
  },
};

export default function AgentFrameworkConfiguration({
  selectedTarget,
  updateCustomTarget,
  agentType,
}: AgentFrameworkConfigurationProps) {
  const [copied, setCopied] = useState(false);
  const { recordEvent } = useTelemetry();

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

    // Track template copy event
    recordEvent('feature_used', {
      feature: 'redteam_agent_template_copied',
      agent_framework: agentType,
      framework_name: frameworkDetails.name,
    });
  };

  const handleDownloadTemplate = () => {
    const template = getAgentTemplate(agentType);
    const blob = new Blob([template], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = agentType === 'generic-agent' ? 'custom_agent.py' : `${agentType}_agent.py`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Track template download event
    recordEvent('feature_used', {
      feature: 'redteam_agent_template_downloaded',
      agent_framework: agentType,
      framework_name: frameworkDetails.name,
      filename: filename,
    });
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
        {agentType === 'generic-agent' ? (
          <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic' }}>
            💡 <strong>Tip:</strong> Promptfoo works with ANY Python-based agent framework. Simply
            implement the call_api function in your Python file to connect your agent.
          </Typography>
        ) : (
          <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block', mb: 1 }}>
            Install with: <strong>pip install {frameworkDetails.pip}</strong>
          </Typography>
        )}
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
              Download {agentType === 'generic-agent' ? 'custom_agent.py' : `${agentType}_agent.py`}
            </Button>
          </Stack>
        </Box>

        <Alert severity="warning">
          <Typography variant="body2">
            <strong>Next Steps:</strong>
          </Typography>
          <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            <li>Save the template to a Python file</li>
            {agentType === 'generic-agent' ? (
              <>
                <li>Install your agent framework's dependencies</li>
                <li>
                  Replace the TODOs in the <code>call_api</code> function with your agent
                  implementation
                </li>
              </>
            ) : (
              <>
                <li>
                  Install required dependencies: <code>pip install {frameworkDetails.pip}</code>
                </li>
                <li>
                  Customize the agent logic in the <code>call_api</code> function
                </li>
              </>
            )}
            <li>Update the Provider ID field above with the file path</li>
          </ol>
        </Alert>
      </Stack>
    </Box>
  );
}
