import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Grid,
  Box,
  Chip,
  Stack,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import ChatIcon from '@mui/icons-material/Chat';
import DescriptionIcon from '@mui/icons-material/Description';
import TranslateIcon from '@mui/icons-material/Translate';
import { useStore } from '@app/stores/evalConfig';
import type { UnifiedConfig } from '@promptfoo/types';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  tags: string[];
  config: Partial<UnifiedConfig>;
}

const templates: Template[] = [
  {
    id: 'customer-support',
    name: 'Customer Support Bot',
    description: 'Test a customer service chatbot with realistic scenarios and quality checks',
    icon: <ChatIcon fontSize="large" color="primary" />,
    tags: ['Conversational AI', 'Quality Assurance'],
    config: {
      prompts: [
        `You are a helpful customer support assistant for an e-commerce company. 
Answer the customer's question: {{question}}

Be polite, professional, and provide accurate information.`,
      ],
      providers: [
        { id: 'openai:gpt-4o-mini', config: { temperature: 0.3 } },
        { id: 'anthropic:messages:claude-3-haiku', config: { temperature: 0.3 } },
      ],
      tests: [
        {
          vars: {
            question: 'How do I return an item I purchased?',
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'The response should explain the return process clearly',
            },
            {
              type: 'llm-rubric',
              value: 'The tone should be helpful and professional',
            },
          ],
        },
        {
          vars: {
            question: "My order hasn't arrived yet. It's been 2 weeks!",
          },
          assert: [
            {
              type: 'llm-rubric',
              value: "The response should acknowledge the customer's frustration",
            },
            {
              type: 'llm-rubric',
              value: 'The response should offer concrete next steps',
            },
          ],
        },
        {
          vars: {
            question: 'What are your business hours?',
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'The response should provide clear information about hours',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'code-generation',
    name: 'Code Generation',
    description: 'Evaluate code generation quality across different programming tasks',
    icon: <CodeIcon fontSize="large" color="primary" />,
    tags: ['Development', 'Code Quality'],
    config: {
      prompts: [
        `Write a {{language}} function that {{task}}.

Requirements:
- Include proper error handling
- Add helpful comments
- Follow best practices`,
      ],
      providers: [
        { id: 'openai:gpt-4.1', config: { temperature: 0.2 } },
        { id: 'anthropic:messages:claude-4-sonnet', config: { temperature: 0.2 } },
      ],
      tests: [
        {
          vars: {
            language: 'Python',
            task: 'reverses a string without using built-in reverse functions',
          },
          assert: [
            {
              type: 'contains',
              value: 'def',
            },
            {
              type: 'llm-rubric',
              value: 'The code should correctly reverse a string',
            },
            {
              type: 'llm-rubric',
              value: 'The code should handle edge cases like empty strings',
            },
          ],
        },
        {
          vars: {
            language: 'JavaScript',
            task: 'validates an email address using regex',
          },
          assert: [
            {
              type: 'contains',
              value: 'function',
            },
            {
              type: 'javascript',
              value: 'output.includes("@") && output.includes(".")',
            },
            {
              type: 'llm-rubric',
              value: 'The regex pattern should be reasonable for email validation',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'content-summarization',
    name: 'Content Summarization',
    description: 'Test summarization capabilities with different content types and lengths',
    icon: <DescriptionIcon fontSize="large" color="primary" />,
    tags: ['Text Processing', 'Summarization'],
    config: {
      prompts: [
        `Summarize the following {{content_type}} in {{style}} style:

{{content}}

Keep the summary {{length}} and focus on the key points.`,
      ],
      providers: [
        { id: 'openai:gpt-4o', config: { temperature: 0.3 } },
        { id: 'google:gemini-2.5-pro', config: { temperature: 0.3 } },
      ],
      tests: [
        {
          vars: {
            content_type: 'article',
            style: 'bullet-point',
            length: 'brief (3-5 points)',
            content:
              'Climate change is one of the most pressing challenges facing humanity today. Rising global temperatures, caused primarily by greenhouse gas emissions from human activities, are leading to melting ice caps, rising sea levels, and more frequent extreme weather events. Scientists agree that immediate action is needed to reduce carbon emissions and transition to renewable energy sources. Many countries have committed to net-zero emissions targets, but progress varies significantly. Individual actions, while important, must be complemented by systemic changes in how we produce and consume energy.',
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'The summary should be in bullet-point format',
            },
            {
              type: 'llm-rubric',
              value: 'The summary should capture the main points about climate change',
            },
            {
              type: 'similar',
              value: 'Climate change is a major challenge caused by human emissions',
              threshold: 0.7,
            },
          ],
        },
        {
          vars: {
            content_type: 'meeting notes',
            style: 'executive',
            length: 'concise (1 paragraph)',
            content:
              'Q3 Sales Meeting - Present: CEO, CFO, Sales VP, Marketing VP. Sales VP reported 15% growth over Q2, exceeding targets by 3%. Main drivers: new enterprise clients in healthcare sector, successful product launch in APAC region. Challenges: increased competition in US market, longer sales cycles for enterprise deals. Marketing VP proposed increased digital ad spend for Q4, focusing on LinkedIn and industry publications. CFO approved $500K additional marketing budget. Action items: 1) Sales team to provide detailed competitive analysis by EOW, 2) Marketing to launch new campaign by Oct 15, 3) Schedule follow-up meeting for Nov 1.',
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'The summary should be written in executive style (formal, concise)',
            },
            {
              type: 'llm-rubric',
              value: 'The summary should mention key metrics and decisions',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'translation-quality',
    name: 'Translation Quality',
    description: 'Evaluate translation accuracy and fluency across multiple languages',
    icon: <TranslateIcon fontSize="large" color="primary" />,
    tags: ['Multilingual', 'Translation'],
    config: {
      prompts: [
        `Translate the following text from {{source_language}} to {{target_language}}:

"{{text}}"

Maintain the tone and style of the original text.`,
      ],
      providers: [
        { id: 'openai:gpt-4o', config: { temperature: 0.1 } },
        { id: 'google:gemini-2.5-pro', config: { temperature: 0.1 } },
      ],
      tests: [
        {
          vars: {
            source_language: 'English',
            target_language: 'Spanish',
            text: 'The early bird catches the worm.',
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'The translation should convey the meaning of being early brings advantages',
            },
            {
              type: 'llm-rubric',
              value: 'The translation should be grammatically correct Spanish',
            },
          ],
        },
        {
          vars: {
            source_language: 'English',
            target_language: 'French',
            text: 'Please handle with care. This package contains fragile items.',
          },
          assert: [
            {
              type: 'contains-any',
              value: ['fragile', 'précaution', 'soin'],
            },
            {
              type: 'llm-rubric',
              value: 'The translation should maintain the warning tone',
            },
          ],
        },
        {
          vars: {
            source_language: 'English',
            target_language: 'Japanese',
            text: 'Welcome to our store! How may I help you today?',
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'The translation should be polite and use appropriate Japanese honorifics',
            },
            {
              type: 'llm-rubric',
              value: 'The translation should be suitable for customer service context',
            },
          ],
        },
      ],
    },
  },
];

interface TemplateSelectorProps {
  open: boolean;
  onClose: () => void;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ open, onClose }) => {
  const { updateConfig } = useStore();

  const handleSelectTemplate = (template: Template) => {
    // Apply the template configuration
    updateConfig(template.config);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="template-selector-title"
    >
      <DialogTitle id="template-selector-title">
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Choose a Template</Typography>
          <IconButton aria-label="close" onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" paragraph>
          Start quickly with a pre-configured template. You can customize everything after
          selecting.
        </Typography>

        <Grid container spacing={3}>
          {templates.map((template) => (
            <Grid item xs={12} sm={6} key={template.id}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea
                  onClick={() => handleSelectTemplate(template)}
                  sx={{ height: '100%' }}
                >
                  <CardContent>
                    <Box display="flex" alignItems="flex-start" gap={2} mb={2}>
                      <Box>{template.icon}</Box>
                      <Box flex={1}>
                        <Typography variant="h6" gutterBottom>
                          {template.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {template.description}
                        </Typography>
                      </Box>
                    </Box>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {template.tags.map((tag) => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" />
                      ))}
                    </Stack>

                    <Box mt={2}>
                      <Typography variant="caption" color="text.secondary">
                        • {template.config.prompts?.length || 0} prompt
                        {(template.config.prompts?.length || 0) !== 1 ? 's' : ''} •{' '}
                        {template.config.providers?.length || 0} provider
                        {(template.config.providers?.length || 0) !== 1 ? 's' : ''} •{' '}
                        {template.config.tests?.length || 0} test case
                        {(template.config.tests?.length || 0) !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Start from Scratch
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(TemplateSelector);
