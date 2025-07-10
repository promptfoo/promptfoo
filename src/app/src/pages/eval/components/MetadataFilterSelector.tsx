import React from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import type { SelectChangeEvent } from '@mui/material/Select';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface MetadataFilterSelectorProps {
  selectedMetadata: string | null;
  availableMetadata: string[];
  onChange: (metadata: string | null) => void;
  metadataCounts?: Record<string, number>; // For future enhancement
}

// TODO: For value-based filtering, extend the interface:
// interface MetadataFilter {
//   key: string;
//   value?: string;
//   operator?: 'equals' | 'contains' | 'startsWith' | 'endsWith';
// }
//
// And update the component to support:
// - Input field for value when a key is selected
// - Operator selector (equals, contains, etc.)
// - Format like "model:gpt-4" or "version=1.0"

export const MetadataFilterSelector: React.FC<MetadataFilterSelectorProps> = ({
  selectedMetadata,
  availableMetadata,
  onChange,
  metadataCounts,
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
      setShowValueInput(true); // Changed: Always show value input when a key is selected
    } else {
      setSelectedKey('');
      setFilterValue('');
      setShowValueInput(false);
    }
  }, [selectedMetadata]);

  if (availableMetadata.length === 0) {
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
      setFilterValue(''); // Clear any previous value
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

  const handleValueKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && selectedKey && filterValue) {
      onChange(`${selectedKey}:${filterValue}`);
    }
  };

  // Group metadata keys by common prefixes (future enhancement)
  // const groupMetadataKeys = (keys: string[]): Record<string, string[]> => {
  //   const groups: Record<string, string[]> = { 'All Keys': [] };
  //   keys.forEach((key) => {
  //     const prefix = key.includes('.') ? key.split('.')[0] : null;
  //     if (prefix && keys.filter((k) => k.startsWith(prefix + '.')).length > 1) {
  //       if (!groups[prefix]) {groups[prefix] = [];}
  //       groups[prefix].push(key);
  //     } else {
  //       groups['All Keys'].push(key);
  //     }
  //   });
  //   return groups;
  // };

  const renderMenuItems = () => {
    if (metadataCounts) {
      // Enhanced version with counts
      return availableMetadata.map((key) => (
        <MenuItem key={key} value={key}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span>{key}</span>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              ({metadataCounts[key] || 0})
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

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <FormControl variant="outlined" size="small" sx={{ minWidth: 180 }}>
        <InputLabel id="metadata-filter-label">Filter by Metadata</InputLabel>
        <Select
          labelId="metadata-filter-label"
          id="metadata-filter-select"
          value={selectedKey}
          onChange={handleKeyChange}
          label="Filter by Metadata"
          aria-label="Filter results by metadata key"
          aria-describedby="metadata-filter-description"
        >
          <MenuItem value="" aria-label="Show all metadata">
            <em>All metadata</em>
          </MenuItem>
          {renderMenuItems()}
        </Select>
      </FormControl>

      {showValueInput && (
        <>
          <TextField
            size="small"
            placeholder="Enter value (optional)"
            value={filterValue}
            onChange={handleValueChange}
            onKeyPress={handleValueKeyPress}
            sx={{ minWidth: 150 }}
            aria-label="Filter by metadata value"
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
                  <br />
                </Typography>
              </Box>
            }
            arrow
          >
            <InfoOutlinedIcon fontSize="small" color="action" />
          </Tooltip>
        </>
      )}

      <Typography
        id="metadata-filter-description"
        variant="caption"
        sx={{ position: 'absolute', left: '-9999px' }}
      >
        Select a metadata key to filter evaluation results. Optionally enter a value to filter by
        specific values.
      </Typography>
    </Box>
  );
};
