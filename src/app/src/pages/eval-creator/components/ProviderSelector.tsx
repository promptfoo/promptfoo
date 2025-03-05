import React from 'react';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import type { ProviderOptions } from '@promptfoo/types';
import { useProvidersStore } from '../../../store/providersStore';
import AddLocalProviderDialog from './AddLocalProviderDialog';
import ProviderConfigDialog from './ProviderConfigDialog';

const defaultProviders: ProviderOptions[] = ([] as (ProviderOptions & { id: string })[])
  .concat(
    [
      // OpenAI - Latest models
      'openai:o1-preview',
      'openai:o1-2024-12-17',
      'openai:o1-mini',
      'openai:o3-mini',
      'openai:o3-mini-2025-01-31',
      'openai:gpt-4o',
      'openai:gpt-4o-2024-11-20',
      'openai:gpt-4o-2024-08-06',
      'openai:gpt-4o-2024-05-13',
      'openai:gpt-4o-mini',
      'openai:gpt-4o-mini-2024-07-18',
      'openai:gpt-4.5-preview',
      'openai:gpt-4.5-preview-2025-02-27',
      'openai:chatgpt-4o-latest',
    ].map((id) => ({
      id,
      config: {
        organization: '',
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        function_call: undefined,
        functions: undefined,
        stop: undefined,
      },
    })),
  )
  .concat(
    [
      // Anthropic - Latest Claude models
      'anthropic:messages:claude-3-7-sonnet-20250219',
      'anthropic:messages:claude-3-7-sonnet-latest',
      'anthropic:messages:claude-3-5-sonnet-20241022',
      'anthropic:messages:claude-3-5-sonnet-20240620',
      'anthropic:messages:claude-3-5-sonnet-latest',
      'anthropic:messages:claude-3-5-haiku-20241022',
      'anthropic:messages:claude-3-5-haiku-latest',
      'anthropic:messages:claude-3-opus-20240229',
      'anthropic:messages:claude-3-opus-latest',
      'anthropic:messages:claude-3-haiku-20240307',
      'anthropic:messages:claude-3-haiku-latest',
    ].map((id) => ({
      id,
      config: {
        max_tokens: 1024,
        temperature: 0.5,
        top_p: 0.99,
        top_k: 40,
      },
    })),
  )
  .concat(
    [
      // AWS Bedrock - Latest models
      'bedrock:us.meta.llama3-2-90b-instruct-v1:0',
      'bedrock:us.meta.llama3-2-11b-instruct-v1:0',
      'bedrock:us.anthropic.claude-3-7-sonnet-20250619-v1:0',
      'bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      'bedrock:us.anthropic.claude-3-5-sonnet-20240620-v1:0',
      'bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0',
    ].map((id) => ({ id, config: { max_tokens_to_sample: 256, temperature: 0.5 } })),
  )
  .concat(
    [
      // Azure OpenAI - Latest models
      'azureopenai:gpt-4o',
      'azureopenai:gpt-4o-2024-05-13',
      'azureopenai:gpt-4-turbo-2024-04-09',
      'azureopenai:gpt-4-32k-0613',
      'azureopenai:gpt-4-0613',
      'azureopenai:gpt-35-turbo-0125',
    ].map((id) => ({
      id,
      config: {
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        function_call: undefined,
        functions: undefined,
        stop: undefined,
      },
    })),
  )
  .concat(
    [
      // Google - Latest Gemini models
      'google:gemini-2.0-flash-thinking-exp',
      'google:gemini-2.0-flash',
      'google:gemini-2.0-pro',
      'vertex:gemini-pro',
      'vertex:gemini-1.5-pro',
      'vertex:gemini-1.5-flash',
    ].map((id) => ({
      id,
      config: {
        context: undefined,
        examples: undefined,
        temperature: 0,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
        safetySettings: undefined,
        stopSequence: undefined,
      },
    })),
  )
  .concat(
    [
      // Mistral AI - Latest models
      'mistral:open-mistral-nemo',
      'mistral:mistral-large-2-2407',
      'mistral:mistral-large-2-06-24',
      'mistral:mistral-small-2407',
      'mistral:mistral-small-2402',
    ].map((id) => ({
      id,
      config: {
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 1024,
      },
    })),
  )
  .concat(
    [
      // Replicate models
      'replicate:meta/meta-llama-3.2-90b-instruct:2201d364ed237a14dce76a40dbd707f64d2d77ebb6853c41c5729e20fdbecb35',
      'replicate:meta/meta-llama-3.2-11b-instruct:cb6c12cf46a74fe751852750122cdb5a18b8874dd10173b9cf74d223a4e7cb45',
      'replicate:mistralai/mistral-7b-instruct-v0.2:7e5ac252da0dcbbb17b8138fd3ef8d01192eaec9f9d8966ecd2acccfb3d6dfd5',
      'replicate:mistralai/mixtral-8x7b-instruct-v0.1:2048ad509f405307a64bb69a323bbd234d27a9fe0de32e7d6966449244925c2d',
    ].map((id) => ({
      id,
      config: {
        temperature: 0.7,
        top_p: 0.9,
        top_k: -1,
        max_new_tokens: 1024,
        min_new_tokens: -1,
        repetition_penalty: 1.15,
        prompt_template: '{prompt}',
      },
    })),
  )
  .concat(
    [
      // Cohere models
      'cohere:command-r',
      'cohere:command-r-plus',
      'cohere:command-light',
    ].map((id) => ({
      id,
      config: {
        temperature: 0.7,
        max_tokens: 1024,
      },
    })),
  )
  .concat(
    [
      // Groq models
      'groq:llama-3.3-70b-versatile',
      'groq:llama-3.1-70b-instruct',
      'groq:mixtral-8x7b-32768',
    ].map((id) => ({
      id,
      config: {
        temperature: 0.7,
        max_tokens: 1024,
      },
    })),
  )
  .concat(
    [
      // Together AI models
      'together:Qwen/Qwen2-72B-Instruct',
      'together:meta-llama/Meta-Llama-3.2-90B-Instruct',
      'together:meta-llama/Meta-Llama-3.2-11B-Instruct',
    ].map((id) => ({
      id,
      config: {
        temperature: 0.7,
        max_tokens: 1024,
      },
    })),
  )
  .sort((a, b) => a.id.localeCompare(b.id));

const PREFIX_TO_PROVIDER: Record<string, string> = {
  anthropic: 'Anthropic',
  bedrock: 'Amazon Web Services',
  azureopenai: 'Azure',
  openai: 'OpenAI',
  replicate: 'Replicate',
  google: 'Google AI Studio',
  vertex: 'Google Vertex AI',
  mistral: 'Mistral AI',
  cohere: 'Cohere',
  groq: 'Groq',
  together: 'Together AI',
};

function getGroupName(label?: string) {
  if (!label) {
    return 'Other';
  }
  const name = label.split(':')[0];
  return PREFIX_TO_PROVIDER[name] || name;
}

interface ProviderSelectorProps {
  providers: ProviderOptions[];
  onChange: (providers: ProviderOptions[]) => void;
}

const ProviderSelector: React.FC<ProviderSelectorProps> = ({ providers, onChange }) => {
  const { customProviders, addCustomProvider } = useProvidersStore();
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderOptions | null>(null);
  const [isAddLocalDialogOpen, setIsAddLocalDialogOpen] = React.useState(false);

  const handleAddLocalProvider = (provider: ProviderOptions) => {
    addCustomProvider(provider);
    onChange([...providers, provider]);
  };

  const allProviders = React.useMemo(() => {
    return [...defaultProviders, ...customProviders];
  }, [customProviders]);

  const handleProviderClick = (provider: ProviderOptions | string) => {
    setSelectedProvider(typeof provider === 'string' ? { id: provider } : provider);
  };

  const handleSave = (providerId: string, config: Record<string, any>) => {
    onChange(providers.map((p) => (p.id === providerId ? { ...p, config } : p)));
    setSelectedProvider(null);
  };

  const getOptionLabel = (option: string | ProviderOptions): string => {
    if (typeof option === 'string') {
      return option;
    }
    return option.label || option.id || '';
  };

  const getGroupByValue = (option: string | ProviderOptions): string => {
    const id = typeof option === 'string' ? option : option.id;
    return getGroupName(id);
  };

  return (
    <Box
      mt={2}
      sx={{
        transition: (theme) =>
          theme.transitions.create(['background-color', 'color'], {
            duration: theme.transitions.duration.standard,
          }),
      }}
    >
      <Box display="flex" gap={2} alignItems="stretch">
        <Autocomplete
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              height: '56px',
              transition: (theme) =>
                theme.transitions.create(
                  ['background-color', 'border-color', 'box-shadow', 'color'],
                  { duration: theme.transitions.duration.standard },
                ),
            },
            '& .MuiAutocomplete-paper': {
              transition: (theme) =>
                theme.transitions.create(
                  ['background-color', 'border-color', 'box-shadow', 'color'],
                  { duration: theme.transitions.duration.standard },
                ),
            },
            '& .MuiOutlinedInput-notchedOutline': {
              transition: (theme) =>
                theme.transitions.create(['border-color'], {
                  duration: theme.transitions.duration.standard,
                }),
            },
            '& .MuiInputLabel-root': {
              transition: (theme) =>
                theme.transitions.create(['color', 'transform'], {
                  duration: theme.transitions.duration.standard,
                }),
            },
            '& .MuiAutocomplete-listbox': {
              transition: (theme) =>
                theme.transitions.create(['background-color', 'color'], {
                  duration: theme.transitions.duration.standard,
                }),
            },
          }}
          multiple
          freeSolo
          options={allProviders}
          value={providers}
          groupBy={getGroupByValue}
          onChange={(event, newValue: (string | ProviderOptions)[]) => {
            onChange(newValue.map((value) => (typeof value === 'string' ? { id: value } : value)));
          }}
          getOptionLabel={getOptionLabel}
          renderTags={(value, getTagProps) =>
            value.map((provider, index: number) => (
              <Chip
                variant="outlined"
                label={getOptionLabel(provider)}
                {...getTagProps({ index })}
                key={typeof provider === 'string' ? provider : provider.id || index}
                onClick={() => handleProviderClick(provider)}
                sx={{
                  transition: (theme) =>
                    theme.transitions.create(['background-color', 'border-color', 'color'], {
                      duration: theme.transitions.duration.standard,
                    }),
                }}
              />
            ))
          }
          renderInput={(params) => (
            <TextField
              {...params}
              variant="outlined"
              placeholder="Select LLM providers"
              helperText={
                providers.length > 0 ? 'Click a provider to configure its settings.' : null
              }
              sx={{
                transition: (theme) =>
                  theme.transitions.create(['background-color', 'color'], {
                    duration: theme.transitions.duration.standard,
                  }),
              }}
            />
          )}
        />
        <Button
          variant="outlined"
          onClick={() => setIsAddLocalDialogOpen(true)}
          startIcon={<FolderOpenIcon />}
          sx={{
            height: '56px',
            whiteSpace: 'nowrap',
            px: 3,
            minWidth: 'fit-content',
            transition: (theme) =>
              theme.transitions.create(
                ['background-color', 'border-color', 'color', 'box-shadow'],
                { duration: theme.transitions.duration.standard },
              ),
          }}
        >
          Reference Local Provider
        </Button>
      </Box>
      <AddLocalProviderDialog
        open={isAddLocalDialogOpen}
        onClose={() => setIsAddLocalDialogOpen(false)}
        onAdd={handleAddLocalProvider}
      />
      {selectedProvider && selectedProvider.id && (
        <ProviderConfigDialog
          open={!!selectedProvider}
          providerId={selectedProvider.id}
          config={selectedProvider.config}
          onClose={() => setSelectedProvider(null)}
          onSave={handleSave}
        />
      )}
    </Box>
  );
};

export default ProviderSelector;
