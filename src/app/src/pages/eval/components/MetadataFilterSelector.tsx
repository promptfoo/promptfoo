import React from 'react';
import ClearIcon from '@mui/icons-material/Clear';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import type { SelectChangeEvent } from '@mui/material/Select';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { isValidMetadataKey, isValidWildcardPattern } from './metadataUtils';

interface MetadataFilterSelectorProps {
  selectedMetadata: string | null;
  availableMetadata: string[];
  onChange: (metadata: string | null) => void;
  metadataCounts?: Record<string, number>;
  isLoading?: boolean;
}

export const MetadataFilterSelector: React.FC<MetadataFilterSelectorProps> = ({
  selectedMetadata,
  availableMetadata,
  onChange,
  metadataCounts,
  isLoading = false,
}) => {
  const [selectedKey, setSelectedKey] = React.useState<string>('');
  const [filterValue, setFilterValue] = React.useState<string>('');
  const [showValueInput, setShowValueInput] = React.useState(false);
  const [keyError, setKeyError] = React.useState<string>('');
  const [valueError, setValueError] = React.useState<string>('');

  // Parse the current filter to extract key and value
  React.useEffect(() => {
    if (selectedMetadata && selectedMetadata.includes(':')) {
      const colonIndex = selectedMetadata.indexOf(':');
      const key = selectedMetadata.substring(0, colonIndex);
      const value = selectedMetadata.substring(colonIndex + 1);
      setSelectedKey(key);
      setFilterValue(value);
      setShowValueInput(true);
    } else if (selectedMetadata) {
      setSelectedKey(selectedMetadata);
      setFilterValue('');
      setShowValueInput(true);
    } else {
      setSelectedKey('');
      setFilterValue('');
      setShowValueInput(false);
    }
  }, [selectedMetadata]);

  if (availableMetadata.length === 0 && !isLoading) {
    return null;
  }

  const handleKeyChange = (event: SelectChangeEvent) => {
    const key = event.target.value;
    setKeyError('');
    setValueError('');

    if (key === '') {
      onChange(null);
      setSelectedKey('');
      setFilterValue('');
      setShowValueInput(false);
    } else {
      // Validate the key
      if (!isValidMetadataKey(key)) {
        setKeyError('Invalid characters in metadata key');
        return;
      }

      setSelectedKey(key);
      setFilterValue('');
      setShowValueInput(true);
      // Initially just filter by key existence
      onChange(key);
    }
  };

  const handleValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFilterValue(value);
    setValueError('');

    // Validate wildcard patterns
    if (value && !isValidWildcardPattern(value)) {
      setValueError('Invalid wildcard pattern (avoid multiple consecutive *)');
      return;
    }

    if (selectedKey) {
      if (value) {
        // Format as key:value for backend
        onChange(`${selectedKey}:${value}`);
      } else {
        // If value is cleared, just filter by key
        onChange(selectedKey);
      }
    }
  };

  const handleValueKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && selectedKey && !valueError) {
      event.preventDefault();
      if (filterValue) {
        onChange(`${selectedKey}:${filterValue}`);
      } else {
        onChange(selectedKey);
      }
    }
  };

  const handleClearValue = () => {
    setFilterValue('');
    setValueError('');
    if (selectedKey) {
      onChange(selectedKey);
    }
  };

  const renderMenuItems = () => {
    if (metadataCounts) {
      // Enhanced version with counts
      return availableMetadata.map((key) => {
        const isInvalid = !isValidMetadataKey(key);
        return (
          <MenuItem key={key} value={key} disabled={isInvalid}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {key}
                </Typography>
                {isInvalid && (
                  <Tooltip title="This key contains invalid characters">
                    <WarningAmberIcon fontSize="small" color="warning" />
                  </Tooltip>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {metadataCounts[key] || 0}
              </Typography>
            </Box>
          </MenuItem>
        );
      });
    }

    // Basic version
    return availableMetadata.map((key) => {
      const isInvalid = !isValidMetadataKey(key);
      return (
        <MenuItem key={key} value={key} disabled={isInvalid}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {key}
            {isInvalid && (
              <Tooltip title="This key contains invalid characters">
                <WarningAmberIcon fontSize="small" color="warning" />
              </Tooltip>
            )}
          </Box>
        </MenuItem>
      );
    });
  };

  // Loading skeleton
  if (isLoading && availableMetadata.length === 0) {
    return (
      <Box sx={{ minWidth: 180 }}>
        <Skeleton variant="rectangular" height={38} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  // Group the filter components visually
  const filterContent = (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <FormControl variant="outlined" size="small" sx={{ minWidth: 180 }} error={!!keyError}>
        <InputLabel id="metadata-filter-label">
          {isLoading ? 'Loading...' : 'Filter by Metadata'}
        </InputLabel>
        <Select
          labelId="metadata-filter-label"
          id="metadata-filter-select"
          value={selectedKey}
          onChange={handleKeyChange}
          label={isLoading ? 'Loading...' : 'Filter by Metadata'}
          aria-label="Filter results by metadata key"
          aria-describedby={keyError ? 'metadata-key-error' : 'metadata-filter-help'}
          disabled={isLoading}
          endAdornment={
            isLoading ? (
              <InputAdornment position="end" sx={{ mr: 2 }}>
                <CircularProgress size={20} />
              </InputAdornment>
            ) : undefined
          }
        >
          <MenuItem value="" aria-label="Show all metadata">
            <em>All metadata</em>
          </MenuItem>
          {!isLoading && renderMenuItems()}
        </Select>
        {keyError && <FormHelperText id="metadata-key-error">{keyError}</FormHelperText>}
      </FormControl>

      {showValueInput && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mx: 0.5 }}>
            =
          </Typography>
          <TextField
            size="small"
            placeholder="Any value"
            value={filterValue}
            onChange={handleValueChange}
            onKeyPress={handleValueKeyPress}
            error={!!valueError}
            helperText={valueError}
            sx={{
              minWidth: 120,
              '& .MuiInputBase-input': {
                paddingY: '6px',
              },
            }}
            aria-label="Filter by metadata value"
            aria-describedby={valueError ? 'metadata-value-error' : 'metadata-value-help'}
            InputProps={{
              endAdornment: filterValue && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handleClearValue}
                    edge="end"
                    aria-label="Clear value"
                    sx={{ padding: '4px' }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Tooltip
            title={
              <Box>
                <Typography variant="body2" gutterBottom>
                  <strong>Value Filtering:</strong>
                </Typography>
                <Typography variant="caption" component="div">
                  • Exact match: <code>gpt-4</code>
                  <br />• Starts with: <code>gpt-*</code>
                  <br />• Ends with: <code>*-4</code>
                  <br />• Contains: <code>*gpt*</code>
                </Typography>
                <Typography variant="caption" component="div" sx={{ mt: 1 }}>
                  Press <kbd>Enter</kbd> to apply
                </Typography>
              </Box>
            }
            arrow
            placement="bottom"
          >
            <IconButton size="small" sx={{ p: 0.5 }} aria-label="Metadata filter help">
              <InfoOutlinedIcon fontSize="small" color="action" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      <Typography
        id="metadata-filter-description"
        variant="caption"
        sx={{ position: 'absolute', left: '-9999px' }}
      >
        Select a metadata key to filter evaluation results. Optionally enter a value to filter by
        specific values. Use wildcards (*) for pattern matching.
      </Typography>
    </Box>
  );

  return (
    <>
      {filterContent}
      {/* Screen reader help text */}
      <Box
        id="metadata-filter-help"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Select a metadata key to filter results. You can optionally enter a value with wildcard
        support.
      </Box>
      <Box
        id="metadata-value-help"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Enter a value to filter by. Use asterisk for wildcards: gpt-* for starts with, *-4 for ends
        with, *gpt* for contains. Press Enter to apply.
      </Box>
    </>
  );
};
