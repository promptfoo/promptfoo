import React from 'react';
import { callApi } from '@app/utils/api';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import { styled } from '@mui/material/styles';
import type { ProviderOptions } from '@promptfoo/types';
import { useProvidersStore } from '../../../store/providersStore';
import ProviderConfigDialog from './ProviderConfigDialog';

const defaultProviders: ProviderOptions[] = ([] as (ProviderOptions & { id: string })[])
  .concat(
    [
      'openai:gpt-4o',
      'openai:gpt-4o-2024-08-06',
      'openai:gpt-4o-2024-05-13',
      'openai:gpt-4o-mini',
      'openai:gpt-4o-mini-2024-07-18',
      'openai:gpt-4-turbo',
      'openai:gpt-4',
      'openai:gpt-3.5-turbo',
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
      'anthropic:messages:claude-3-5-sonnet-20241022',
      'anthropic:messages:claude-3-5-sonnet-20240620',
      'anthropic:messages:claude-3-haiku-20240307',
      'anthropic:messages:claude-3-opus-20240229',
    ].map((id) => ({ id, config: { max_tokens: 1024, temperature: 0.5 } })),
  )
  .concat(
    [
      'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0',
      'bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0',
      'bedrock:anthropic.claude-3-opus-20240307-v1:0',
      'bedrock:anthropic.claude-3-haiku-20240307-v1:0',
    ].map((id) => ({ id, config: { max_tokens_to_sample: 256, temperature: 0.5 } })),
  )
  .concat(
    [
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
      'vertex:chat-bison@001',
      'vertex:chat-bison',
      'vertex:chat-bison-32k',
      'vertex:chat-bison-32k@001',
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
      'replicate:replicate/flan-t5-small:69716ad8c34274043bf4a135b7315c7c569ec931d8f23d6826e249e1c142a264',
    ].map((id) => ({
      id,
      config: { temperature: 0.5, max_length: 1024, repetition_penality: 1.0 },
    })),
  )
  .concat(
    [
      'replicate:replicate/codellama-7b-instruct:0103579e86fc75ba0d65912890fa19ef03c84a68554635319accf2e0ba93d3ae',
      'replicate:replicate/codellama-13b-instruct:da5676342de1a5a335b848383af297f592b816b950a43d251a0a9edd0113604b',
      'replicate:replicate/llama-2-70b-chat:2796ee9483c3fd7aa2e171d38f4ca12251a30609463dcfd4cd76703f22e96cdf',
    ].map((id) => ({
      id,
      config: {
        system_prompt: '',
        temperature: 0.75,
        top_p: 0.9,
        top_k: 50,
        max_new_tokens: 128,
        min_new_tokens: -1,
      },
    })),
  )
  .concat(
    [
      'replicate:replicate/codellama-7b:6880b103613a9cd23950c5fd6c140197e519905bd0dd00e448c4858bdd06090a',
      'replicate:replicate/codellama-13b-python:09b87c02dfa403e0c3289166dece62286b3bce49bae39a9c9204713cf94b8b7d',
      'replicate:replicate/codellama-13b:1c914d844307b0588599b8393480a3ba917b660c7e9dfae681542b5325f228db',
      'replicate:replicate/codellama-34b-python:9048743d22a7b19cd0abb018066809ea6af4f2b4717bef9aad3c5ae21ceac00d',
      'replicate:replicate/codellama-34b:0666717e5ead8557dff55ee8f11924b5c0309f5f1ca52f64bb8eec405fdb38a7',
    ].map((id) => ({
      id,
      config: {
        temperature: 0.75,
        top_p: 0.9,
        top_k: 50,
        max_new_tokens: 128,
        min_new_tokens: -1,
      },
    })),
  )
  .concat(
    [
      'replicate:a16z-infra/llama-2-7b-chat:7b0bfc9aff140d5b75bacbed23e91fd3c34b01a1e958d32132de6e0a19796e2c',
      'replicate:a16z-infra/llama-2-13b-chat:2a7f981751ec7fdf87b5b91ad4db53683a98082e9ff7bfd12c8cd5ea85980a52',
    ].map((id) => ({
      id,
      config: {
        temperature: 0.95,
        top_p: 0.95,
        top_k: 250,
        max_new_tokens: 500,
        min_new_tokens: -1,
        repetition_penalty: 1.0,
        system_prompt: '',
      },
    })),
  )
  .concat(
    [
      'replicate:mistralai/mistral-7b-v0.1',
      'replicate:mistralai/mistral-7b-instruct-v0.2',
      'replicate:mistralai/mixtral-8x7b-instruct-v0.1',
    ].map((id) => ({
      id,
      config: {
        temperature: 0.7,
        top_p: 0.9,
        top_k: -1,
        max_new_tokens: 128,
        min_new_tokens: -1,
        repetition_penalty: 1.15,
        prompt_template: '{prompt}',
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
};

function getGroupName(label?: string) {
  if (!label) {
    return 'Other';
  }
  const name = label.split(':')[0];
  return PREFIX_TO_PROVIDER[name] || name;
}

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

interface ProviderSelectorProps {
  providers: ProviderOptions[];
  onChange: (providers: ProviderOptions[]) => void;
}

const ProviderSelector: React.FC<ProviderSelectorProps> = ({ providers, onChange }) => {
  const { customProviders, addCustomProvider } = useProvidersStore();
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderOptions | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      return;
    }

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.py') && !file.name.endsWith('.js')) {
        alert('Only .py and .js files are supported');
        continue;
      }

      try {
        const fileContent = await file.text();
        const response = await callApi('/eval/provider/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileName: file.name,
            fileContent,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to upload provider');
        }

        const { id, label } = await response.json();
        const fileProvider: ProviderOptions = {
          id,
          config: {},
          label,
        };

        addCustomProvider(fileProvider);
        onChange([...providers, fileProvider]);
      } catch (error) {
        console.error('Failed to upload provider:', error);
        alert(`Failed to upload ${file.name}`);
      }
    }

    // Reset file input
    event.target.value = '';
  };

  const allProviders = React.useMemo(() => {
    return [...defaultProviders, ...customProviders];
  }, [customProviders]);

  const handleProviderClick = (provider: ProviderOptions) => {
    setSelectedProvider(provider);
  };

  const handleSave = (providerId: string, config: Record<string, any>) => {
    onChange(providers.map((p) => (p.id === providerId ? { ...p, config } : p)));
    setSelectedProvider(null);
  };

  const getOptionLabel = (option: string | ProviderOptions) => {
    if (typeof option === 'string') {
      return option;
    }
    return option.label || option.id;
  };

  return (
    <Box mt={2}>
      <Box display="flex" gap={2} alignItems="flex-start">
        <Autocomplete
          sx={{ flex: 1 }}
          multiple
          freeSolo
          options={allProviders}
          value={providers}
          groupBy={(option) => getGroupName(option.id)}
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
                key={provider.id || index}
                onClick={() => handleProviderClick(provider)}
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
            />
          )}
        />
        <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
          Upload Provider
          <VisuallyHiddenInput type="file" accept=".py,.js" multiple onChange={handleFileUpload} />
        </Button>
      </Box>
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
