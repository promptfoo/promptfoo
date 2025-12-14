import React from 'react';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
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
    <Box sx={{ '&:not(:last-child)': { mb: 1.5 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 0.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography
            variant="body2"
            component="label"
            id={labelId}
            sx={{
              fontSize: '0.8125rem',
              color: theme.palette.text.primary,
              lineHeight: 1.5,
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
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.75rem',
            color: theme.palette.text.secondary,
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayValue}
        </Typography>
      </Box>
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
          py: 1,
          '& .MuiSlider-rail': {
            height: 4,
            borderRadius: 2,
            opacity: 0.2,
          },
          '& .MuiSlider-track': {
            height: 4,
            borderRadius: 2,
            border: 'none',
          },
          '& .MuiSlider-thumb': {
            width: 16,
            height: 16,
            backgroundColor: theme.palette.primary.main,
            boxShadow: 'none',
            '&::before': {
              display: 'none',
            },
            '&:hover, &.Mui-focusVisible': {
              boxShadow: `0 0 0 6px ${alpha(theme.palette.primary.main, 0.16)}`,
            },
            '&.Mui-active': {
              boxShadow: `0 0 0 8px ${alpha(theme.palette.primary.main, 0.16)}`,
            },
          },
        }}
      />
    </Box>
  );
};

export default React.memo(CompactSlider);
