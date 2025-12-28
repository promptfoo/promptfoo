import React from 'react';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

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
        minHeight: 32,
        py: 0.5,
        px: 0.5,
        mx: -0.5,
        opacity: disabled ? 0.5 : 1,
        borderRadius: 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background-color 150ms ease',
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
          p: 0,
          mr: 1,
          '& .MuiSvgIcon-root': {
            fontSize: '1.25rem',
          },
          color: checked ? theme.palette.primary.main : theme.palette.action.active,
        }}
        inputProps={{
          'aria-labelledby': labelId,
        }}
      />
      <Typography
        variant="body2"
        component="span"
        id={labelId}
        sx={{
          flex: 1,
          fontSize: '0.8125rem',
          color: disabled ? theme.palette.text.disabled : theme.palette.text.primary,
          lineHeight: 1.5,
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      {tooltipText && (
        <Tooltip
          title={tooltipText}
          arrow
          placement="top"
          enterDelay={400}
          componentsProps={{
            tooltip: {
              sx: {
                bgcolor: alpha(theme.palette.grey[800], 0.92),
                fontSize: '0.75rem',
                fontWeight: 400,
                maxWidth: 200,
                py: 0.75,
                px: 1.25,
                borderRadius: 1,
                boxShadow: theme.shadows[8],
                '& .MuiTooltip-arrow': {
                  color: alpha(theme.palette.grey[800], 0.92),
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
              ml: 0.5,
              color: alpha(theme.palette.text.secondary, 0.4),
              '&:hover': {
                backgroundColor: 'transparent',
                color: theme.palette.text.secondary,
              },
            }}
            aria-label={`Information about ${label}`}
          >
            <InfoOutlinedIcon sx={{ fontSize: '0.9rem' }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default React.memo(CompactToggle);
