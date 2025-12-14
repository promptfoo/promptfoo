import React from 'react';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

interface CompactSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onChangeCommitted?: (value: number) => void;
  min: number;
  max: number;
  tooltipText?: string;
  unit?: string;
  unlimited?: boolean;
}

const CompactSlider = ({
  label,
  value,
  onChange,
  onChangeCommitted,
  min,
  max,
  tooltipText,
  unit,
  unlimited = false,
}: CompactSliderProps) => {
  const theme = useTheme();
  const labelId = `compact-slider-${label.replace(/\s+/g, '-').toLowerCase()}`;

  const displayValue =
    unlimited && value >= max ? 'Unlimited' : `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <Box
      sx={{
        py: 0.5,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.25 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography
            variant="body2"
            id={labelId}
            sx={{
              fontSize: '0.8125rem',
              color: theme.palette.text.primary,
              lineHeight: 1.4,
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
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.75rem',
            color: theme.palette.text.secondary,
            fontWeight: 500,
            minWidth: 60,
            textAlign: 'right',
          }}
        >
          {displayValue}
        </Typography>
      </Stack>
      <Slider
        value={value}
        onChange={(_, newValue) => onChange(newValue as number)}
        onChangeCommitted={
          onChangeCommitted ? (_, newValue) => onChangeCommitted(newValue as number) : undefined
        }
        min={min}
        max={max}
        size="small"
        aria-labelledby={labelId}
        sx={{
          height: 4,
          '& .MuiSlider-thumb': {
            width: 14,
            height: 14,
            '&:hover, &.Mui-focusVisible': {
              boxShadow: `0px 0px 0px 6px ${alpha(theme.palette.primary.main, 0.16)}`,
            },
          },
          '& .MuiSlider-rail': {
            opacity: 0.3,
          },
        }}
      />
    </Box>
  );
};

export default React.memo(CompactSlider);
