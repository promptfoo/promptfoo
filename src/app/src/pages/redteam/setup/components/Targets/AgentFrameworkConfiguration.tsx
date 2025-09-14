import { useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { AGENT_TEMPLATE } from './consts';

import type { ProviderOptions } from '../../types';

interface AgentFrameworkConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  agentType: string;
}

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
    description: 'Official OpenAI SDK for building AI agents.',
    pip: 'openai-agents',
  },
  'pydantic-ai': {
    name: 'PydanticAI',
    description: 'Type-safe AI agents with structured outputs using Pydantic',
    pip: 'pydantic-ai',
  },
  'google-adk': {
    name: 'Google ADK',
    description: 'Google AI Development Kit for building agents with Gemini',
    pip: 'google-genai',
  },
  'generic-agent': {
    name: 'Other Agent',
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
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const { recordEvent } = useTelemetry();

  const frameworkDetails = frameworkInfo[agentType] || {
    name: agentType,
    description: 'Agent framework',
    pip: agentType,
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(AGENT_TEMPLATE);
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
    const blob = new Blob([AGENT_TEMPLATE], { type: 'text/plain' });
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

  const handleOpenTemplateModal = () => {
    setTemplateModalOpen(true);
    recordEvent('feature_used', {
      feature: 'redteam_agent_template_modal_opened',
      agent_framework: agentType,
      framework_name: frameworkDetails.name,
    });
  };

  const handleCloseTemplateModal = () => {
    setTemplateModalOpen(false);
    setCopied(false);
  };

  const templateFilename = 'agent_template.py';

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
          <Typography variant="h6" sx={{ mb: 1 }}>
            Quickstart Template
          </Typography>
          <Typography variant="body1" sx={{ maxWidth: '1000px', mb: 2, color: 'text.secondary' }}>
            Want to see how it works? Promptfoo can generate a starter template for{' '}
            {frameworkDetails.name} that shows you how to connect your agent to the red team
            evaluation system. You can use this as a starting point and customize it to fit your
            needs.
          </Typography>
          <Button variant="contained" startIcon={<CodeIcon />} onClick={handleOpenTemplateModal}>
            Generate Template File
          </Button>
        </Box>
      </Stack>

      {/* Template Modal */}
      <Dialog
        open={templateModalOpen}
        onClose={handleCloseTemplateModal}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            minHeight: '80vh',
          },
        }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">
              {frameworkDetails.name} Template - {templateFilename}
            </Typography>
            <IconButton
              aria-label="close"
              onClick={handleCloseTemplateModal}
              sx={{ color: (theme) => theme.palette.grey[500] }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
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

          <Paper
            elevation={0}
            sx={{
              p: 2,
              backgroundColor: (theme) => (theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5'),
              borderRadius: 1,
              border: '1px solid',
              borderColor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
            }}
          >
            <Box
              component="pre"
              sx={{
                margin: 0,
                fontSize: '0.875rem',
                lineHeight: 1.5,
                overflowX: 'auto',
                fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
              }}
            >
              <code>{AGENT_TEMPLATE}</code>
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopyTemplate}
            disabled={copied}
          >
            {copied ? 'Copied!' : 'Copy Template'}
          </Button>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate}>
            Download {templateFilename}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
