import React from 'react';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { PromptSuggestion } from '../types';

const PROMPT_SUGGESTIONS: PromptSuggestion[] = [
  // General prompts
  {
    label: 'Chatbot Assistant',
    template: 'You are a helpful assistant. {{task}}',
    description: 'Basic chatbot prompt for general assistance',
    variables: ['task'],
    category: 'general',
  },
  {
    label: 'Customer Support',
    template: 'You are a customer support agent for {{company}}. Help the customer with: {{issue}}',
    description: 'Customer service interactions',
    variables: ['company', 'issue'],
    category: 'general',
  },
  {
    label: 'Code Assistant',
    template: 'You are an expert {{language}} developer. {{task}}\n\nRequirements:\n{{requirements}}',
    description: 'Programming and code generation tasks',
    variables: ['language', 'task', 'requirements'],
    category: 'general',
  },
  
  // Testing-specific prompts
  {
    label: 'Q&A System',
    template: 'Answer the following question based on the provided context.\n\nContext: {{context}}\n\nQuestion: {{question}}',
    description: 'Question-answering with context',
    variables: ['context', 'question'],
    category: 'testing',
  },
  {
    label: 'Summarization',
    template: 'Summarize the following {{contentType}} in {{style}} style:\n\n{{content}}',
    description: 'Content summarization tasks',
    variables: ['contentType', 'style', 'content'],
    category: 'testing',
  },
  {
    label: 'Translation',
    template: 'Translate the following text from {{sourceLanguage}} to {{targetLanguage}}:\n\n{{text}}',
    description: 'Language translation tasks',
    variables: ['sourceLanguage', 'targetLanguage', 'text'],
    category: 'testing',
  },
  
  // Safety testing prompts
  {
    label: 'Content Moderation',
    template: 'You are a content moderator. Review the following {{contentType}} and determine if it violates our guidelines:\n\n{{content}}',
    description: 'Test content moderation capabilities',
    variables: ['contentType', 'content'],
    category: 'safety',
  },
  {
    label: 'Jailbreak Resistance',
    template: 'You are a helpful assistant with strong safety guidelines. {{userInput}}',
    description: 'Test resistance to jailbreak attempts',
    variables: ['userInput'],
    category: 'safety',
  },
  
  // Performance testing prompts
  {
    label: 'Complex Reasoning',
    template: 'Solve the following {{problemType}} problem step by step:\n\n{{problem}}',
    description: 'Test complex reasoning abilities',
    variables: ['problemType', 'problem'],
    category: 'performance',
  },
  {
    label: 'Data Analysis',
    template: 'Analyze the following {{dataType}} data and provide insights:\n\n{{data}}',
    description: 'Test data analysis capabilities',
    variables: ['dataType', 'data'],
    category: 'performance',
  },
  
  // UX testing prompts
  {
    label: 'Tone Testing',
    template: 'Respond to the following in a {{tone}} tone:\n\n{{message}}',
    description: 'Test different communication tones',
    variables: ['tone', 'message'],
    category: 'ux',
  },
  {
    label: 'Persona Testing',
    template: 'You are a {{persona}}. Respond to: {{query}}',
    description: 'Test different AI personas',
    variables: ['persona', 'query'],
    category: 'ux',
  },
];

interface PromptSuggestionsProps {
  onSelectPrompt: (prompt: string) => void;
  currentPrompt?: string;
}

const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({ onSelectPrompt, currentPrompt }) => {
  const [open, setOpen] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  const categories = Array.from(new Set(PROMPT_SUGGESTIONS.map(s => s.category).filter(Boolean)));
  
  const filteredSuggestions = selectedCategory
    ? PROMPT_SUGGESTIONS.filter(s => s.category === selectedCategory)
    : PROMPT_SUGGESTIONS;

  const handleSelectPrompt = (suggestion: PromptSuggestion) => {
    onSelectPrompt(suggestion.template);
    setOpen(false);
  };

  return (
    <>
      <Tooltip title="Get prompt suggestions">
        <IconButton onClick={() => setOpen(true)} color="primary" size="small">
          <AutoAwesome />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h6">Prompt Suggestions</Typography>
            <Chip
              icon={<AutoAwesome />}
              label="AI-Powered"
              size="small"
              color="primary"
              variant="outlined"
            />
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3}>
            {/* Category Filter */}
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Chip
                label="All"
                onClick={() => setSelectedCategory(null)}
                color={selectedCategory === null ? 'primary' : 'default'}
                variant={selectedCategory === null ? 'filled' : 'outlined'}
              />
              {categories.map((category) => (
                <Chip
                  key={category}
                  label={category?.charAt(0).toUpperCase() + category?.slice(1)}
                  onClick={() => setSelectedCategory(category!)}
                  color={selectedCategory === category ? 'primary' : 'default'}
                  variant={selectedCategory === category ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>

            {/* Suggestions Grid */}
            <Grid container spacing={2}>
              {filteredSuggestions.map((suggestion, index) => (
                <Grid item xs={12} md={6} key={index}>
                  <Card 
                    variant="outlined" 
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': { 
                        boxShadow: 2,
                        borderColor: 'primary.main',
                      },
                    }}
                    onClick={() => handleSelectPrompt(suggestion)}
                  >
                    <CardContent>
                      <Stack spacing={1}>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {suggestion.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {suggestion.description}
                        </Typography>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontFamily: 'monospace',
                            bgcolor: 'grey.100',
                            p: 1,
                            borderRadius: 1,
                            fontSize: '0.85rem',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {suggestion.template.length > 100 
                            ? suggestion.template.substring(0, 100) + '...' 
                            : suggestion.template}
                        </Typography>
                        {suggestion.variables && suggestion.variables.length > 0 && (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            <Typography variant="caption" color="text.secondary">
                              Variables:
                            </Typography>
                            {suggestion.variables.map((variable) => (
                              <Chip
                                key={variable}
                                label={`{{${variable}}}`}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.75rem' }}
                              />
                            ))}
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* Custom Prompt Info */}
            <Card variant="outlined" sx={{ bgcolor: 'grey.50' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  💡 <strong>Tip:</strong> These are starting templates. Customize them to fit your specific testing needs. 
                  Use {`{{variable}}`} syntax to create dynamic placeholders that will be filled with test data.
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PromptSuggestions;