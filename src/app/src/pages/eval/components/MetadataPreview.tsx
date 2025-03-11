import React, { useMemo } from 'react';
import TagIcon from '@mui/icons-material/Tag';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { ellipsize } from '../../../../../util/text';

// Important keys that provide significant context for test results
const PRIORITY_KEYS = [
  'testId',
  'testPurpose',
  'category',
  'scenario',
  'testType',
  'environment',
  'version',
  'model',
  'provider',
];

// Keys that should be deprioritized in the compact view
const DEPRIORITIZED_KEYS = [
  'timestamp',
  'duration',
  'raw',
  'data',
  'context',
  'createdAt',
  'updatedAt',
];

// Filter out metadata that's displayed elsewhere
const getFilteredMetadata = (metadata?: Record<string, any>) => {
  if (!metadata) {
    return {};
  }

  const filtered = { ...metadata };

  // Remove special fields that we don't need to show in the preview
  ['messages', 'redteamFinalPrompt', 'redteamHistory', 'redteamTreeHistory'].forEach((key) => {
    if (key in filtered) {
      delete filtered[key];
    }
  });

  return filtered;
};

// Prioritize metadata entries for the compact view
const prioritizeMetadata = (entries: Array<[string, any]>, limit = 3) => {
  // Sort entries by priority
  const sorted = [...entries].sort((a, b) => {
    const [keyA] = a;
    const [keyB] = b;

    // Check if keys are in priority list (higher index = lower priority)
    const priorityA = PRIORITY_KEYS.indexOf(keyA);
    const priorityB = PRIORITY_KEYS.indexOf(keyB);

    // Check if keys are in deprioritized list
    const isDeprioritizedA = DEPRIORITIZED_KEYS.includes(keyA);
    const isDeprioritizedB = DEPRIORITIZED_KEYS.includes(keyB);

    // Prioritize PRIORITY_KEYS, deprioritize DEPRIORITIZED_KEYS
    if (priorityA !== -1 && priorityB !== -1) {
      return priorityA - priorityB; // Lower index (higher priority) comes first
    } else if (priorityA !== -1) {
      return -1; // A is in priority list, comes first
    } else if (priorityB !== -1) {
      return 1; // B is in priority list, comes first
    } else if (isDeprioritizedA && !isDeprioritizedB) {
      return 1; // A is deprioritized, comes last
    } else if (!isDeprioritizedA && isDeprioritizedB) {
      return -1; // B is deprioritized, comes last
    }

    // Alphabetical order for the rest
    return keyA.localeCompare(keyB);
  });

  // Return the top entries
  return sorted.slice(0, limit);
};

// Component for rendering a single metadata item as a pill
const MetadataPill = ({ keyName, value }: { keyName: string; value: any }) => {
  const theme = useTheme();
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  const shortValue = ellipsize(stringValue, 20);
  const fullContent = `${keyName}: ${stringValue}`;

  return (
    <Tooltip title={fullContent} arrow>
      <Chip
        size="small"
        icon={<TagIcon fontSize="small" />}
        label={`${keyName}: ${shortValue}`}
        variant="outlined"
        sx={{
          maxWidth: '100%',
          fontSize: '0.75rem',
          borderRadius: '16px',
          '& .MuiChip-icon': {
            fontSize: '0.875rem',
            color: theme.palette.text.secondary,
          },
        }}
      />
    </Tooltip>
  );
};

export interface MetadataPreviewProps {
  metadata?: Record<string, any>;
  showDialog?: () => void;
  compact?: boolean;
}

export default function MetadataPreview({
  metadata,
  showDialog,
  compact = false,
}: MetadataPreviewProps) {
  const theme = useTheme();

  const filteredMetadata = useMemo(() => getFilteredMetadata(metadata), [metadata]);
  const isEmpty = Object.keys(filteredMetadata).length === 0;

  // Get all metadata entries as pairs
  const allMetadataEntries = useMemo(() => Object.entries(filteredMetadata), [filteredMetadata]);

  // For compact view, prioritize and limit entries
  const visibleEntries = useMemo(
    () => prioritizeMetadata(allMetadataEntries, compact ? 4 : Infinity),
    [allMetadataEntries, compact],
  );

  // Count of hidden entries for badge
  const hiddenCount = allMetadataEntries.length - visibleEntries.length;

  if (isEmpty) {
    return null;
  }

  return (
    <Box
      onClick={showDialog}
      sx={{
        cursor: showDialog ? 'pointer' : 'default',
        width: '100%',
        p: 1,
        borderRadius: 1,
        '&:hover': showDialog
          ? {
              backgroundColor: theme.palette.action.hover,
            }
          : {},
      }}
    >
      <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.75} alignItems="center">
        {visibleEntries.map(([key, value]) => (
          <MetadataPill key={key} keyName={key} value={value} />
        ))}

        {hiddenCount > 0 && (
          <Tooltip title={`${hiddenCount} more metadata items`} arrow>
            <Badge badgeContent={hiddenCount} color="primary" sx={{ ml: 0.5 }}>
              <Chip
                size="small"
                label="more"
                variant="outlined"
                sx={{
                  fontSize: '0.75rem',
                  borderRadius: '16px',
                }}
              />
            </Badge>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
}
