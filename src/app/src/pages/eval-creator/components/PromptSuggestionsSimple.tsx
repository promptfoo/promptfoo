import React from 'react';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// Simplified prompt templates
const EXAMPLE_PROMPTS = [
  {
    label: 'Chatbot Assistant',
    template: 'You are a helpful assistant. {{task}}',
    icon: '💬',
  },
  {
    label: 'Customer Support',
    template: 'You are a customer support agent for {{company}}. Help the customer with: {{issue}}',
    icon: '🎧',
  },
  {
    label: 'Code Assistant',
    template:
      'You are an expert {{language}} developer. {{task}}\n\nRequirements:\n{{requirements}}',
    icon: '👨‍💻',
  },
  {
    label: 'Q&A System',
    template:
      'Answer the following question based on the provided context.\n\nContext: {{context}}\n\nQuestion: {{question}}',
    icon: '❓',
  },
  {
    label: 'Summarization',
    template: 'Summarize the following {{contentType}} in {{style}} style:\n\n{{content}}',
    icon: '📝',
  },
  {
    label: 'Translation',
    template:
      'Translate the following text from {{sourceLanguage}} to {{targetLanguage}}:\n\n{{text}}',
    icon: '🌐',
  },
];

interface PromptSuggestionsSimpleProps {
  onSelectPrompt: (prompt: string) => void;
  disabled?: boolean;
}

const PromptSuggestionsSimple: React.FC<PromptSuggestionsSimpleProps> = ({
  onSelectPrompt,
  disabled = false,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelectExample = (template: string) => {
    onSelectPrompt(template);
    handleClose();
  };

  return (
    <>
      <Button
        color="secondary"
        onClick={handleClick}
        disabled={disabled}
        startIcon={<AutoAwesome />}
        sx={{ mr: 1 }}
      >
        Load Example
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        PaperProps={{
          sx: {
            maxWidth: 400,
            mt: 1,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Choose a template to get started
          </Typography>
        </Box>
        <Divider />
        {EXAMPLE_PROMPTS.map((example, index) => (
          <MenuItem
            key={index}
            onClick={() => handleSelectExample(example.template)}
            sx={{
              py: 1.5,
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, fontSize: '1.2rem' }}>{example.icon}</ListItemIcon>
            <ListItemText
              primary={example.label}
              primaryTypographyProps={{
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            />
          </MenuItem>
        ))}
        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary">
            💡 Tip: Use {`{{variable}}`} syntax for dynamic values
          </Typography>
        </Box>
      </Menu>
    </>
  );
};

export default PromptSuggestionsSimple;
