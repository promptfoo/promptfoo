import React, { useState } from 'react';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import { alpha, useTheme } from '@mui/material';
import { useUserPreferences } from '@app/stores/userPreferences';

interface HelpTextProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const HelpText: React.FC<HelpTextProps> = ({ title, children, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { experienceMode } = useUserPreferences();

  // Hide help text for experienced users
  if (experienceMode === 'experienced') {
    return null;
  }

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      sx={{
        backgroundColor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
        boxShadow: 'none',
        border: '1px solid',
        borderColor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        borderRadius: 1,
        '&:before': { display: 'none' },
        mb: 2,
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
        },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMore sx={{ color: 'primary.main' }} />}
        sx={{
          padding: '12px 16px',
          minHeight: 'auto',
          '& .MuiAccordionSummary-content': { margin: 0 },
          '&:hover': {
            backgroundColor: (theme) =>
              theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
          },
        }}
      >
        <Typography
          variant="body2"
          color="primary"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <HelpOutlineIcon fontSize="small" />
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ padding: '16px 24px', paddingTop: 0 }}>
        <Box>{children}</Box>
      </AccordionDetails>
    </Accordion>
  );
};

interface QuickHelpProps {
  text: string;
}

export const QuickHelp: React.FC<QuickHelpProps> = ({ text }) => {
  return (
    <Tooltip title={text} arrow placement="top">
      <IconButton size="small" sx={{ ml: 0.5 }}>
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
};

export const PromptsHelp: React.FC = () => {
  const { experienceMode } = useUserPreferences();
  const theme = useTheme();

  if (experienceMode === 'experienced') {
    return null;
  }

  return (
    <HelpText title="What are prompts?" defaultExpanded>
      <Typography variant="body2" color="text.secondary" paragraph>
        Prompts are the instructions you send to AI models (like ChatGPT or Claude). They define
        what you want the AI to do.
      </Typography>
      <Box
        sx={{
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
          borderRadius: 1,
          p: 2,
          mb: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary" paragraph sx={{ mb: 1 }}>
          <strong>Variables:</strong> Use{' '}
          <code
            style={{
              backgroundColor: 'rgba(66, 165, 245, 0.1)',
              padding: '2px 6px',
              borderRadius: '4px',
              color: '#2196f3',
              fontFamily: 'monospace',
            }}
          >
            {'{{variable}}'}
          </code>{' '}
          syntax to create placeholders that change with each test case.
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
        >
          "Write a story about{' '}
          <span style={{ color: theme.palette.primary.main }}>{'{{animal}}'}</span> in{' '}
          <span style={{ color: theme.palette.primary.main }}>{'{{location}}'}</span>"
        </Typography>
      </Box>
      <Alert
        severity="info"
        sx={{
          borderRadius: 1,
          '& .MuiAlert-icon': { color: 'primary.main' },
        }}
      >
        <Typography variant="body2">
          <strong>Tip:</strong> Start with one simple prompt, then add test cases to see how it
          works!
        </Typography>
      </Alert>
    </HelpText>
  );
};

export const ProvidersHelp: React.FC = () => {
  const { experienceMode } = useUserPreferences();

  if (experienceMode === 'experienced') {
    return null;
  }

  return (
    <HelpText title="What are providers?">
      <Typography variant="body2" color="text.secondary" paragraph>
        Providers are the AI models that will process your prompts. You can test the same prompt
        across multiple models.
      </Typography>
      <Box
        sx={{
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
          borderRadius: 1,
          p: 2,
          mb: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
          Popular Examples:
        </Typography>
        <Box
          component="ul"
          sx={{
            margin: 0,
            paddingLeft: '20px',
            '& li': {
              marginBottom: '4px',
              color: 'text.secondary',
            },
          }}
        >
          <li>
            <strong>OpenAI:</strong> GPT-4o, GPT-3.5 Turbo
          </li>
          <li>
            <strong>Anthropic:</strong> Claude 3.5 Sonnet, Claude 3.5 Haiku
          </li>
          <li>
            <strong>Google:</strong> Gemini 1.5 Pro, Gemini 1.5 Flash
          </li>
        </Box>
      </Box>
      <Alert
        severity="info"
        sx={{
          borderRadius: 1,
          '& .MuiAlert-icon': { color: 'primary.main' },
        }}
      >
        <Typography variant="body2">
          Each provider will receive the same prompts and test cases, allowing you to compare their
          outputs side by side.
        </Typography>
      </Alert>
    </HelpText>
  );
};

export const TestCasesHelp: React.FC = () => {
  const { experienceMode } = useUserPreferences();
  const theme = useTheme();

  if (experienceMode === 'experienced') {
    return null;
  }

  return (
    <HelpText title="What are test cases?">
      <Typography variant="body2" color="text.secondary" paragraph>
        Test cases provide different values for the variables in your prompts. Each test case
        creates a unique version of your prompt.
      </Typography>
      <Box
        sx={{
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
          borderRadius: 1,
          p: 2,
          mb: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
          How it works:
        </Typography>
        <Box
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            '& > div': {
              marginBottom: '8px',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
            },
          }}
        >
          <div>
            <span style={{ color: theme.palette.text.secondary }}>1.</span> Prompt: "Write about{' '}
            <span style={{ color: theme.palette.primary.main }}>{'{{animal}}'}</span> in{' '}
            <span style={{ color: theme.palette.primary.main }}>{'{{location}}'}</span>"
          </div>
          <div>
            <span style={{ color: theme.palette.text.secondary }}>2.</span> Test Case:{' '}
            {`{ animal: "dog", location: "park" }`}
          </div>
          <div>
            <span style={{ color: theme.palette.text.secondary }}>3.</span> Result: "Write about dog
            in park"
          </div>
        </Box>
      </Box>
      <Alert
        severity="success"
        sx={{
          borderRadius: 1,
          '& .MuiAlert-icon': { color: 'success.main' },
        }}
      >
        <Typography variant="body2">
          <strong>Assertions</strong> are optional checks that verify the AI's response meets your
          requirements (e.g., "must mention the animal", "should be under 100 words").
        </Typography>
      </Alert>
    </HelpText>
  );
};

export const EvaluationHelp: React.FC = () => {
  const { experienceMode } = useUserPreferences();

  if (experienceMode === 'experienced') {
    return null;
  }

  return (
    <HelpText title="How do evaluations work?">
      <Typography variant="body2" color="text.secondary" paragraph>
        When you run an evaluation:
      </Typography>
      <Box
        sx={{
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
          borderRadius: 1,
          p: 2,
          mb: 2,
        }}
      >
        <Box
          component="ol"
          sx={{
            margin: 0,
            paddingLeft: '24px',
            '& li': {
              marginBottom: '8px',
              color: 'text.secondary',
              '&::marker': {
                color: 'primary.main',
                fontWeight: 600,
              },
            },
          }}
        >
          <li>Each test case fills in the variables in your prompts</li>
          <li>Every provider receives each prompt variation</li>
          <li>The AI responses are collected and checked against assertions</li>
          <li>You get a report comparing all outputs</li>
        </Box>
      </Box>
      <Alert
        severity="info"
        sx={{
          borderRadius: 1,
          '& .MuiAlert-icon': { color: 'primary.main' },
        }}
      >
        <Typography variant="body2">
          This helps you <strong>find the best prompts</strong>,{' '}
          <strong>identify edge cases</strong>, and <strong>compare different AI models</strong>{' '}
          objectively.
        </Typography>
      </Alert>
    </HelpText>
  );
};

export const WorkflowHelp: React.FC = () => {
  const { experienceMode } = useUserPreferences();

  if (experienceMode === 'experienced') {
    return null;
  }

  return (
    <Alert
      severity="success"
      sx={{
        mb: 2,
        borderRadius: 1,
        backgroundColor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(46, 125, 50, 0.1)' : 'rgba(237, 247, 237, 1)',
        '& .MuiAlert-icon': {
          color: (theme) => theme.palette.success.main,
        },
      }}
    >
      <Typography variant="body2" paragraph sx={{ fontWeight: 600, mb: 1 }}>
        Quick Start Guide:
      </Typography>
      <Typography variant="body2" component="div">
        <Box
          component="ol"
          sx={{
            margin: 0,
            paddingLeft: '24px',
            '& li': {
              marginBottom: '4px',
            },
          }}
        >
          <li>Add a prompt with variables (or use "Load Example")</li>
          <li>Select AI providers to test</li>
          <li>Generate test cases (or add manually)</li>
          <li>Click "Run Evaluation" to see results</li>
        </Box>
      </Typography>
      <Typography variant="body2" sx={{ mt: 2 }}>
        <Link
          href="https://docs.promptfoo.dev"
          target="_blank"
          rel="noopener"
          sx={{
            color: 'success.main',
            textDecoration: 'none',
            fontWeight: 500,
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          View full documentation →
        </Link>
      </Typography>
    </Alert>
  );
};
