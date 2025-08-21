import React, { useEffect, useState } from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { ProviderOptions } from '../../types';

interface FoundationModelConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  providerType: string;
}

const FoundationModelConfiguration: React.FC<FoundationModelConfigurationProps> = ({
  selectedTarget,
  updateCustomTarget,
  providerType,
}) => {
  const [modelId, setModelId] = useState(selectedTarget.id || '');

  useEffect(() => {
    setModelId(selectedTarget.id || '');
  }, [selectedTarget.id]);

  const handleModelIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value;
    setModelId(newId);
    updateCustomTarget('id', newId);
  };

  const getProviderInfo = (type: string) => {
    const providerConfigs = {
      openai: {
        name: 'OpenAI',
        defaultModel: 'openai:gpt-4o',
        placeholder: 'openai:gpt-4o, openai:gpt-4o-mini, openai:o1-preview',
        docUrl: 'https://www.promptfoo.dev/docs/providers/openai',
        envVar: 'OPENAI_API_KEY',
      },
      anthropic: {
        name: 'Anthropic',
        defaultModel: 'anthropic:messages:claude-3-5-sonnet-20241022',
        placeholder:
          'anthropic:messages:claude-3-5-sonnet-20241022, anthropic:messages:claude-3-5-haiku-20241022',
        docUrl: 'https://www.promptfoo.dev/docs/providers/anthropic',
        envVar: 'ANTHROPIC_API_KEY',
      },
      google: {
        name: 'Google AI Studio',
        defaultModel: 'google:gemini-1.5-pro',
        placeholder: 'google:gemini-1.5-pro, google:gemini-1.5-flash',
        docUrl: 'https://www.promptfoo.dev/docs/providers/google',
        envVar: 'GOOGLE_API_KEY',
      },
      vertex: {
        name: 'Google Vertex AI',
        defaultModel: 'vertex:gemini-1.5-pro',
        placeholder: 'vertex:gemini-1.5-pro, vertex:gemini-1.5-flash',
        docUrl: 'https://www.promptfoo.dev/docs/providers/vertex',
        envVar: 'GOOGLE_APPLICATION_CREDENTIALS',
      },
      mistral: {
        name: 'Mistral AI',
        defaultModel: 'mistral:mistral-large-latest',
        placeholder: 'mistral:mistral-large-latest, mistral:mistral-small-latest',
        docUrl: 'https://www.promptfoo.dev/docs/providers/mistral',
        envVar: 'MISTRAL_API_KEY',
      },
      cohere: {
        name: 'Cohere',
        defaultModel: 'cohere:command-r-plus',
        placeholder: 'cohere:command-r-plus, cohere:command-r',
        docUrl: 'https://www.promptfoo.dev/docs/providers/cohere',
        envVar: 'COHERE_API_KEY',
      },
      groq: {
        name: 'Groq',
        defaultModel: 'groq:llama-3.1-70b-versatile',
        placeholder: 'groq:llama-3.1-70b-versatile, groq:mixtral-8x7b-32768',
        docUrl: 'https://www.promptfoo.dev/docs/providers/groq',
        envVar: 'GROQ_API_KEY',
      },
      deepseek: {
        name: 'DeepSeek',
        defaultModel: 'deepseek:deepseek-chat',
        placeholder: 'deepseek:deepseek-chat, deepseek:deepseek-coder',
        docUrl: 'https://www.promptfoo.dev/docs/providers/deepseek',
        envVar: 'DEEPSEEK_API_KEY',
      },
      azure: {
        name: 'Azure OpenAI',
        defaultModel: 'azure:chat:gpt-4o',
        placeholder: 'azure:chat:your-deployment-name',
        docUrl: 'https://www.promptfoo.dev/docs/providers/azure',
        envVar: 'AZURE_OPENAI_API_KEY',
      },
      openrouter: {
        name: 'OpenRouter',
        defaultModel: 'openrouter:openai/gpt-4o',
        placeholder: 'openrouter:openai/gpt-4o, openrouter:anthropic/claude-3.5-sonnet',
        docUrl: 'https://www.promptfoo.dev/docs/providers/openrouter',
        envVar: 'OPENROUTER_API_KEY',
      },
    };

    return (
      providerConfigs[type as keyof typeof providerConfigs] || {
        name: type.charAt(0).toUpperCase() + type.slice(1),
        defaultModel: `${type}:model`,
        placeholder: `${type}:model-name`,
        docUrl: 'https://www.promptfoo.dev/docs/providers',
        envVar: `${type.toUpperCase()}_API_KEY`,
      }
    );
  };

  const providerInfo = getProviderInfo(providerType);

  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom>
        {providerInfo.name} Configuration
      </Typography>

      <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
        <TextField
          fullWidth
          label="Model ID"
          value={modelId}
          onChange={handleModelIdChange}
          margin="normal"
          required
          placeholder={providerInfo.placeholder}
          helperText={
            <>
              Specify the model to use. See{' '}
              <Link href={providerInfo.docUrl} target="_blank">
                {providerInfo.name} documentation
              </Link>{' '}
              for available models.
            </>
          }
        />

        <Accordion sx={{ mt: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box>
              <Typography variant="subtitle1">Advanced Configuration</Typography>
              <Typography variant="body2" color="text.secondary">
                Model parameters and API settings
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <TextField
                label="Temperature"
                type="number"
                inputProps={{ min: 0, max: 2, step: 0.1 }}
                value={selectedTarget.config?.temperature ?? ''}
                onChange={(e) =>
                  updateCustomTarget('temperature', parseFloat(e.target.value) || undefined)
                }
                helperText="Controls randomness (0.0 to 2.0)"
              />

              <TextField
                label="Max Tokens"
                type="number"
                inputProps={{ min: 1 }}
                value={selectedTarget.config?.max_tokens ?? ''}
                onChange={(e) =>
                  updateCustomTarget('max_tokens', parseInt(e.target.value) || undefined)
                }
                helperText="Maximum number of tokens to generate"
              />

              <TextField
                label="Top P"
                type="number"
                inputProps={{ min: 0, max: 1, step: 0.01 }}
                value={selectedTarget.config?.top_p ?? ''}
                onChange={(e) =>
                  updateCustomTarget('top_p', parseFloat(e.target.value) || undefined)
                }
                helperText="Nucleus sampling parameter (0.0 to 1.0)"
              />

              <TextField
                label="API Key"
                type="password"
                value={selectedTarget.config?.apiKey ?? ''}
                onChange={(e) => updateCustomTarget('apiKey', e.target.value || undefined)}
                helperText={`Optional - defaults to ${providerInfo.envVar} environment variable`}
              />
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
};

export default FoundationModelConfiguration;
