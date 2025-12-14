import React from 'react';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { tokens } from '../tokens';

interface CompactToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltipText?: string;
  disabled?: boolean;
}

const CompactToggle = ({
  label,
  checked,
  onChange,
  tooltipText,
  disabled = false,
}: CompactToggleProps) => {
  const theme = useTheme();
  const labelId = `compact-toggle-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        height: 32,
        py: 0.25,
        opacity: disabled ? tokens.opacity.disabled : 1,
        transition: `all ${tokens.animation.fast}ms ease`,
        borderRadius: tokens.borderRadius.small,
        '&:hover': {
          backgroundColor: disabled ? 'transparent' : alpha(theme.palette.action.hover, 0.04),
        },
      }}
      role="listitem"
    >
      <Checkbox
        checked={checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        size="small"
        sx={{
          p: 0.5,
          mr: 0.75,
          '& .MuiSvgIcon-root': {
            fontSize: '1.1rem',
          },
          color: checked ? theme.palette.primary.main : theme.palette.action.active,
        }}
        inputProps={{
          'aria-labelledby': labelId,
        }}
      />
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          id={labelId}
          sx={{
            fontSize: '0.8125rem',
            color: disabled ? theme.palette.text.disabled : theme.palette.text.primary,
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </Typography>
        {tooltipText && (
          <Tooltip
            title={tooltipText}
            arrow
            placement="top"
            enterDelay={300}
            componentsProps={{
              tooltip: {
                sx: {
                  bgcolor: alpha(theme.palette.grey[800], 0.95),
                  fontSize: '0.75rem',
                  maxWidth: 220,
                  borderRadius: 1,
                  '& .MuiTooltip-arrow': {
                    color: alpha(theme.palette.grey[800], 0.95),
                  },
                },
              },
            }}
          >
            <IconButton
              size="small"
              tabIndex={-1}
              sx={{
                p: 0.25,
                color: alpha(theme.palette.text.secondary, 0.5),
                '&:hover': {
                  backgroundColor: 'transparent',
                  color: theme.palette.text.secondary,
                },
              }}
              aria-label={`Information about ${label}`}
            >
              <InfoOutlinedIcon sx={{ fontSize: '0.875rem' }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
};

export default React.memo(CompactToggle);
