import React from 'react';
import ClearIcon from '@mui/icons-material/Clear';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import type { SelectChangeEvent } from '@mui/material/Select';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

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
    if (key === '') {
      onChange(null);
      setSelectedKey('');
      setFilterValue('');
      setShowValueInput(false);
    } else {
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
    if (event.key === 'Enter' && selectedKey) {
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
    if (selectedKey) {
      onChange(selectedKey);
    }
  };

  const renderMenuItems = () => {
    if (metadataCounts) {
      // Enhanced version with counts
      return availableMetadata.map((key) => (
        <MenuItem key={key} value={key}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {key}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {metadataCounts[key] || 0}
            </Typography>
          </Box>
        </MenuItem>
      ));
    }

    // Basic version
    return availableMetadata.map((key) => (
      <MenuItem key={key} value={key}>
        {key}
      </MenuItem>
    ));
  };

  // Group the filter components visually
  const filterContent = (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
      <FormControl variant="outlined" size="small" sx={{ minWidth: 180 }}>
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
          aria-describedby="metadata-filter-description"
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
      </FormControl>

      {showValueInput && (
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.5,
            backgroundColor: 'action.hover',
            borderRadius: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
            =
          </Typography>
          <TextField
            size="small"
            placeholder="Enter value (optional)"
            value={filterValue}
            onChange={handleValueChange}
            onKeyPress={handleValueKeyPress}
            sx={{ 
              minWidth: 150,
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'background.paper',
              }
            }}
            aria-label="Filter by metadata value"
            InputProps={{
              endAdornment: filterValue && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handleClearValue}
                    edge="end"
                    aria-label="Clear value"
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
          >
            <InfoOutlinedIcon fontSize="small" color="action" sx={{ ml: 0.5 }} />
          </Tooltip>
        </Paper>
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

  return filterContent;
};
