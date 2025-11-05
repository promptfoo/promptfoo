import React from 'react';

import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CircularProgress from '@mui/material/CircularProgress';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  defaultProviders,
  getProviderGroup as getProviderGroupUtil,
} from '../../../../../constants/defaultProviders';
import { callApi } from '../../../utils/api';
import { useProvidersStore } from '../../../store/providersStore';
import AddLocalProviderDialog from './AddLocalProviderDialog';
import ProviderConfigDialog from './ProviderConfigDialog';
import type { ProviderOptions } from '@promptfoo/types';

interface ProviderSelectorProps {
  providers: ProviderOptions[];
  onChange: (providers: ProviderOptions[]) => void;
}

const ProviderSelector = ({ providers, onChange }: ProviderSelectorProps) => {
  const { customProviders, addCustomProvider } = useProvidersStore();
  const [selectedProvider, setSelectedProvider] = React.useState<ProviderOptions | null>(null);
  const [isAddLocalDialogOpen, setIsAddLocalDialogOpen] = React.useState(false);
  const [serverProviders, setServerProviders] = React.useState<ProviderOptions[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Fetch providers from server on mount
  React.useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await callApi('/providers');
        if (!response.ok) {
          throw new Error('Failed to load providers from server');
        }
        const data = await response.json();
        setServerProviders(data.providers);
      } catch (err) {
        console.error('Failed to load providers from server:', err);
        // Fallback to defaults
        setServerProviders(defaultProviders);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProviders();
  }, []);

  const handleAddLocalProvider = (provider: ProviderOptions) => {
    addCustomProvider(provider);
    onChange([...providers, provider]);
  };

  const allProviders = React.useMemo(() => {
    // Use server providers (which might be custom or defaults)
    return [...serverProviders, ...customProviders];
  }, [serverProviders, customProviders]);

  const handleProviderClick = (provider: ProviderOptions | string) => {
    setSelectedProvider(typeof provider === 'string' ? { id: provider } : provider);
  };

  const handleSave = (providerId: string, config: Record<string, any>) => {
    onChange(providers.map((p) => (p.id === providerId ? { ...p, config } : p)));
    setSelectedProvider(null);
  };

  const getOptionLabel = (option: string | ProviderOptions): string => {
    if (!option) {
      return '';
    }

    if (typeof option === 'string') {
      return option;
    }

    if (typeof option === 'object' && option) {
      return option.label || option.id || '';
    }

    return '';
  };

  const getProviderId = (option: string | ProviderOptions): string => {
    if (!option) {
      return '';
    }

    if (typeof option === 'string') {
      return option;
    }

    if (typeof option === 'object' && option) {
      return option.id || '';
    }

    return '';
  };

  if (isLoading) {
    return (
      <Box mt={2} display="flex" justifyContent="center" alignItems="center" minHeight="100px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box mt={2}>
      <Box display="flex" gap={2} alignItems="flex-start">
        <Autocomplete
          sx={{
            flex: 1,
            '& .MuiOutlinedInput-root': {
              minHeight: '56px',
              height: 'auto',
              padding: '8px 14px 8px 8px !important',
              flexWrap: 'wrap',
            },
            '& .MuiAutocomplete-tag': {
              margin: '2px',
            },
          }}
          multiple
          freeSolo
          options={allProviders}
          value={providers}
          groupBy={getProviderGroupUtil}
          onChange={(_event, newValue: (string | ProviderOptions)[]) => {
            const validValues = newValue.filter((value) => value !== null && value !== undefined);
            onChange(
              validValues.map((value) => (typeof value === 'string' ? { id: value } : value)),
            );
          }}
          getOptionLabel={getOptionLabel}
          renderOption={(props, option) => {
            const label = getOptionLabel(option);
            const id = getProviderId(option);
            return (
              <li {...props}>
                <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <Typography variant="body1">{label}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    {id}
                  </Typography>
                </Box>
              </li>
            );
          }}
          renderTags={(value, getTagProps) =>
            value.map((provider, index: number) => {
              const label = getOptionLabel(provider);
              const id = getProviderId(provider);
              return (
                <Tooltip
                  title={id}
                  key={
                    typeof provider === 'string' ? provider : provider.id + (provider.label || '')
                  }
                >
                  <Chip
                    variant="outlined"
                    label={label}
                    {...getTagProps({ index })}
                    onClick={() => handleProviderClick(provider)}
                    sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  />
                </Tooltip>
              );
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              variant="outlined"
              placeholder="Select LLM providers"
              helperText={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  {providers.length > 0
                    ? 'Click a provider to configure its settings. Hover over chips to see model IDs.'
                    : 'Select LLM providers from the dropdown or type to search'}
                  {providers.length > 0 && (
                    <Tooltip title="Model IDs are shown below options in the dropdown menu, as tooltips when hovering over selected models, and in the configuration dialog">
                      <Button size="small" sx={{ ml: 1, minWidth: 0, p: 0.5 }}>
                        ⓘ
                      </Button>
                    </Tooltip>
                  )}
                </Box>
              }
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
            alignSelf: 'flex-start',
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
