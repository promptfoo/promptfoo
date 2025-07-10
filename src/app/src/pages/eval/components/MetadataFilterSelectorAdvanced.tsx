import React, { useState, useMemo } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputAdornment from '@mui/material/InputAdornment';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export interface MetadataFilter {
  key: string;
  value?: string;
  operator?: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'exists';
}

interface MetadataFilterSelectorAdvancedProps {
  selectedFilter: MetadataFilter | null;
  availableMetadata: Array<{
    key: string;
    values?: string[]; // Sample values for this key
    count: number;
  }>;
  onChange: (filter: MetadataFilter | null) => void;
  isLoading?: boolean;
}

/**
 * Advanced metadata filter selector with:
 * - Search within metadata keys
 * - Grouped metadata by prefix
 * - Value-based filtering
 * - Operator selection
 * - Loading state
 *
 * This is an example of how to extend the basic MetadataFilterSelector
 * for more advanced use cases.
 */
export const MetadataFilterSelectorAdvanced: React.FC<MetadataFilterSelectorAdvancedProps> = ({
  selectedFilter,
  availableMetadata,
  onChange,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showValueInput, setShowValueInput] = useState(false);

  // Group metadata by prefix (e.g., "model.name" -> "model" group)
  const groupedMetadata = useMemo(() => {
    const groups: Record<string, typeof availableMetadata> = {};

    availableMetadata.forEach((item) => {
      const prefix = item.key.includes('.') ? item.key.split('.')[0] : 'Other';
      if (!groups[prefix]) {
        groups[prefix] = [];
      }
      groups[prefix].push(item);
    });

    return groups;
  }, [availableMetadata]);

  // Filter metadata based on search term
  const filteredMetadata = useMemo(() => {
    if (!searchTerm) {return availableMetadata;}

    const lowerSearch = searchTerm.toLowerCase();
    return availableMetadata.filter((item) => item.key.toLowerCase().includes(lowerSearch));
  }, [availableMetadata, searchTerm]);

  const handleKeySelect = (key: string | null) => {
    if (!key) {
      onChange(null);
      setShowValueInput(false);
      return;
    }

    const metadata = availableMetadata.find((m) => m.key === key);
    if (metadata?.values && metadata.values.length > 0) {
      setShowValueInput(true);
    }

    onChange({ key, operator: 'exists' });
  };

  const handleValueChange = (value: string) => {
    if (selectedFilter) {
      onChange({
        ...selectedFilter,
        value,
        operator: value ? 'equals' : 'exists',
      });
    }
  };

  const handleOperatorChange = (operator: MetadataFilter['operator']) => {
    if (selectedFilter) {
      onChange({ ...selectedFilter, operator });
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={20} />
        <Typography variant="body2">Loading metadata...</Typography>
      </Box>
    );
  }

  if (availableMetadata.length === 0) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      {/* Key Selector with Search */}
      <Autocomplete
        options={filteredMetadata}
        getOptionLabel={(option) => option.key}
        value={
          selectedFilter
            ? availableMetadata.find((m) => m.key === selectedFilter.key) || null
            : null
        }
        onChange={(_, newValue) => handleKeySelect(newValue?.key || null)}
        sx={{ minWidth: 200 }}
        size="small"
        renderInput={(params) => (
          <TextField
            {...params}
            label="Filter by Metadata"
            placeholder="Search metadata..."
            InputProps={{
              ...params.InputProps,
              startAdornment: (
                <>
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                  {params.InputProps.startAdornment}
                </>
              ),
            }}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        )}
        renderOption={(props, option) => (
          <li {...props}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <Typography>{option.key}</Typography>
              <Chip label={option.count} size="small" sx={{ ml: 1 }} />
            </Box>
          </li>
        )}
        groupBy={(option) => {
          const prefix = option.key.includes('.') ? option.key.split('.')[0] : 'Other';
          return prefix.charAt(0).toUpperCase() + prefix.slice(1);
        }}
        renderGroup={(params) => (
          <li key={params.key}>
            <ListSubheader
              component="div"
              sx={{
                backgroundColor: 'background.paper',
                fontWeight: 'bold',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                color: 'text.secondary',
              }}
            >
              {params.group}
            </ListSubheader>
            {params.children}
          </li>
        )}
      />

      {/* Operator Selector */}
      {selectedFilter && (
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select
            value={selectedFilter.operator || 'exists'}
            onChange={(e) => handleOperatorChange(e.target.value as MetadataFilter['operator'])}
          >
            <MenuItem value="exists">Exists</MenuItem>
            <MenuItem value="equals">Equals</MenuItem>
            <MenuItem value="contains">Contains</MenuItem>
            <MenuItem value="startsWith">Starts with</MenuItem>
            <MenuItem value="endsWith">Ends with</MenuItem>
          </Select>
        </FormControl>
      )}

      {/* Value Input */}
      {selectedFilter && selectedFilter.operator !== 'exists' && (
        <TextField
          size="small"
          placeholder="Enter value..."
          value={selectedFilter.value || ''}
          onChange={(e) => handleValueChange(e.target.value)}
          sx={{ minWidth: 150 }}
        />
      )}

      {/* Current Filter Display */}
      {selectedFilter && (
        <Chip
          label={
            selectedFilter.operator === 'exists'
              ? `${selectedFilter.key} exists`
              : `${selectedFilter.key} ${selectedFilter.operator} "${selectedFilter.value}"`
          }
          onDelete={() => onChange(null)}
          color="primary"
          size="small"
        />
      )}
    </Box>
  );
};

// Example usage comment:
// This component can be used in place of the basic MetadataFilterSelector
// when you need more advanced filtering capabilities. The backend would need
// to be updated to handle the operator and value fields in addition to just
// checking for key existence.
