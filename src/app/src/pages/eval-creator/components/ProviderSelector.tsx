import React from 'react';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ProviderOptions } from '@promptfoo/types';
import {
  DEFAULT_PROVIDERS,
  getProviderGroup,
  getProviderLabel,
  getProviderId,
} from '../../../providers/defaultProviders';
import { useProvidersStore } from '../../../store/providersStore';
import AddLocalProviderDialog from './AddLocalProviderDialog';
import ProviderConfigDialog from './ProviderConfigDialog';

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
    return [...DEFAULT_PROVIDERS, ...customProviders];
  }, [customProviders]);

  const handleProviderClick = (provider: ProviderOptions | string) => {
    setSelectedProvider(typeof provider === 'string' ? { id: provider } : provider);
  };

  const handleSave = (providerId: string, config: Record<string, any>) => {
    onChange(providers.map((p) => (p.id === providerId && !p.label ? { ...p, config } : p)));
    setSelectedProvider(null);
  };

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
          groupBy={getProviderGroup}
          onChange={(event, newValue: (string | ProviderOptions)[]) => {
            const validValues = newValue.filter((value) => value !== null && value !== undefined);
            onChange(
              validValues.map((value) => (typeof value === 'string' ? { id: value } : value)),
            );
          }}
          getOptionLabel={getProviderLabel}
          renderOption={(props, option) => {
            const label = getProviderLabel(option);
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
              const label = getProviderLabel(provider);
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
