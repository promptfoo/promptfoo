import React from 'react';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import type { SelectChangeEvent } from '@mui/material/Select';
import Select from '@mui/material/Select';
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
  if (availableMetadata.length === 0) {
    return null;
  }

  const handleChange = (event: SelectChangeEvent) => {
    onChange(event.target.value === '' ? null : event.target.value);
  };

  // Group metadata keys by common prefixes (future enhancement)
  const groupMetadataKeys = (keys: string[]): Record<string, string[]> => {
    const groups: Record<string, string[]> = { 'All Keys': [] };
    keys.forEach((key) => {
      const prefix = key.includes('.') ? key.split('.')[0] : null;
      if (prefix && keys.filter(k => k.startsWith(prefix + '.')).length > 1) {
        if (!groups[prefix]) groups[prefix] = [];
        groups[prefix].push(key);
      } else {
        groups['All Keys'].push(key);
      }
    });
    return groups;
  };

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
    <Box>
      <FormControl variant="outlined" size="small" sx={{ minWidth: 180 }}>
        <InputLabel id="metadata-filter-label">Filter by Metadata</InputLabel>
        <Select
          labelId="metadata-filter-label"
          id="metadata-filter-select"
          value={selectedMetadata || ''}
          onChange={handleChange}
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
      <Typography
        id="metadata-filter-description"
        variant="caption"
        sx={{ position: 'absolute', left: '-9999px' }}
      >
        Select a metadata key to filter evaluation results
      </Typography>
    </Box>
  );
};
