import React, { useState, useCallback, useEffect } from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  Box,
  Typography,
  Slider,
  TextField,
  InputAdornment,
  IconButton,
  Stack,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import { useDebounce } from 'use-debounce';
import { tokens } from '../tokens';

interface EnhancedRangeSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label: string;
  unit?: string;
  unlimited?: boolean;
  onChangeCommitted?: (value: number) => void;
  disabled?: boolean;
  tooltipText?: string;
  icon?: React.ReactNode;
}

const EnhancedRangeSlider: React.FC<EnhancedRangeSliderProps> = ({
  value,
  onChange,
  min,
  max,
  label,
  unit = '',
  unlimited,
  onChangeCommitted,
  disabled = false,
  tooltipText,
  icon,
}) => {
  // Ensure value is always a valid number
  const safeValue = value === null || value === undefined || Number.isNaN(value) ? min : value;
  const [localValue, setLocalValue] = useState(safeValue);
  const [debouncedValue] = useDebounce(localValue, 150);
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const isUnlimited = unlimited && safeValue === max;

  // Update state when external value changes
  useEffect(() => {
    if (debouncedValue !== safeValue) {
      onChange(debouncedValue);
    }
  }, [debouncedValue, onChange, safeValue]);

  // Safely update input value when external value changes
  useEffect(() => {
    setLocalValue(safeValue);
    setInputValue(isUnlimited ? 'Unlimited' : String(safeValue));
  }, [safeValue, max, unlimited, isUnlimited]);

  const handleChange = useCallback(
    (_: Event | React.SyntheticEvent, newValue: number | number[]) => {
      const newSafeValue = newValue as number;
      setLocalValue(newSafeValue);
      setInputValue(unlimited && newSafeValue === max ? 'Unlimited' : String(newSafeValue));
    },
    [max, unlimited],
  );

  const handleChangeCommitted = useCallback(
    (_: Event | React.SyntheticEvent, value: number | number[]) => {
      if (onChangeCommitted) {
        onChangeCommitted(value as number);
      }
    },
    [onChangeCommitted],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    if (inputValue === 'Unlimited' && unlimited) {
      setLocalValue(max);
      onChange(max);
      return;
    }

    const parsedValue = Number.parseInt(inputValue, 10);
    if (Number.isNaN(parsedValue)) {
      // Revert to current value if input is invalid
      setInputValue(isUnlimited ? 'Unlimited' : String(localValue));
    } else {
      const clampedValue = Math.min(Math.max(parsedValue, min), max);
      setLocalValue(clampedValue);
      setInputValue(String(clampedValue));
      onChange(clampedValue);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue(isUnlimited ? 'Unlimited' : String(localValue));
    }
  };

  return (
    <Box
      sx={{
        maxWidth: '100%',
        mb: tokens.spacing.subsection,
        opacity: disabled ? tokens.opacity.disabled : 1,
        transition: `opacity ${tokens.animation.medium}ms ease`,
        borderRadius: tokens.borderRadius.small,
        padding: tokens.spacing.padding.item,
        paddingLeft: tokens.spacing.padding.compact,
        '&:hover': {
          backgroundColor: disabled ? 'transparent' : alpha(theme.palette.background.default, 0.5),
        },
      }}
      role="group"
      aria-labelledby={`slider-label-${label.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={tokens.spacing.stack.medium}
        mb={tokens.spacing.margin.element}
      >
        {icon && (
          <Box
            sx={{
              color: theme.palette.primary.main,
              display: 'flex',
              alignItems: 'center',
              fontSize: '1.1rem',
            }}
          >
            {icon}
          </Box>
        )}
        <Typography
          variant="body1"
          fontWeight={500}
          sx={{ flexGrow: 1 }}
          id={`slider-label-${label.replace(/\s+/g, '-').toLowerCase()}`}
        >
          {label}
        </Typography>

        <Box
          sx={{
            border: `1px solid ${isEditing ? theme.palette.primary.main : alpha(theme.palette.divider, 0.3)}`,
            borderRadius: tokens.borderRadius.small,
            px: tokens.spacing.padding.item,
            py: tokens.spacing.padding.tiny,
            minWidth: 80,
            textAlign: 'center',
            cursor: 'text',
            transition: `all ${tokens.animation.fast}ms ease`,
            backgroundColor: isEditing ? alpha(theme.palette.primary.main, 0.05) : 'transparent',
            '&:hover': {
              borderColor: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, 0.02),
            },
            boxShadow: isEditing ? `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}` : 'none',
          }}
          onClick={() => !disabled && setIsEditing(true)}
          role="textbox"
          aria-label={`Enter ${label.toLowerCase()} value`}
        >
          {isEditing ? (
            <TextField
              autoFocus
              size="small"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              variant="standard"
              InputProps={{
                disableUnderline: true,
                endAdornment: unit ? (
                  <InputAdornment position="end">
                    <Typography color="text.secondary" variant="body2">
                      {unit}
                    </Typography>
                  </InputAdornment>
                ) : undefined,
              }}
              sx={{
                width: '100%',
                '& input': {
                  textAlign: 'center',
                  p: 0,
                  fontSize: '0.95rem',
                  fontWeight: 500,
                },
              }}
              aria-label={`Enter ${label.toLowerCase()} value`}
            />
          ) : (
            <Typography fontWeight={500}>
              {isUnlimited ? 'Unlimited' : `${localValue}${unit}`}
            </Typography>
          )}
        </Box>

        {tooltipText && (
          <Tooltip
            title={tooltipText}
            arrow
            placement="top"
            enterDelay={500}
            componentsProps={{
              tooltip: {
                sx: {
                  bgcolor:
                    theme.palette.mode === 'dark'
                      ? alpha(theme.palette.primary.dark, 0.9)
                      : alpha(theme.palette.primary.main, 0.9),
                  borderRadius: tokens.borderRadius.small,
                  boxShadow: theme.shadows[tokens.elevation.tooltip],
                  padding: tokens.spacing.padding.compact,
                  '& .MuiTooltip-arrow': {
                    color:
                      theme.palette.mode === 'dark'
                        ? alpha(theme.palette.primary.dark, 0.9)
                        : alpha(theme.palette.primary.main, 0.9),
                  },
                },
              },
            }}
          >
            <IconButton
              size="small"
              sx={{
                p: tokens.spacing.padding.tiny,
                color:
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.primary.light, 0.7)
                    : alpha(theme.palette.primary.main, 0.7),
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                },
              }}
              aria-label={`Information about ${label.toLowerCase()}`}
            >
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Slider
        min={min}
        max={max}
        value={localValue}
        onChange={handleChange}
        onChangeCommitted={onChangeCommitted ? handleChangeCommitted : undefined}
        marks={[
          { value: min, label: `${min}${unit}` },
          { value: max, label: unlimited ? 'Unlimited' : `${max}${unit}` },
        ]}
        disabled={disabled}
        sx={{
          color: theme.palette.primary.main,
          height: 5,
          padding: `${tokens.spacing.padding.compact}px 0`,
          '& .MuiSlider-markLabel': {
            fontSize: '0.75rem',
            color: theme.palette.text.secondary,
          },
          '& .MuiSlider-markLabel[data-index="0"]': {
            transform: 'translateX(0%)',
          },
          '& .MuiSlider-markLabel[data-index="1"]': {
            transform: 'translateX(-100%)',
          },
          '& .MuiSlider-thumb': {
            width: 16,
            height: 16,
            transition: `box-shadow ${tokens.animation.fast}ms ease-in-out`,
            '&:hover, &.Mui-focusVisible': {
              boxShadow: `0px 0px 0px 8px ${alpha(theme.palette.primary.main, 0.16)}`,
            },
            '&:before': {
              boxShadow: `0 0 1px 1px ${alpha(theme.palette.divider, 0.2)}`,
            },
          },
          '& .MuiSlider-rail': {
            opacity: 0.25,
          },
          '& .MuiSlider-track': {
            border: 'none',
            boxShadow: `inset 0 0 1px 1px ${alpha(theme.palette.primary.main, 0.1)}`,
          },
        }}
        aria-labelledby={`slider-label-${label.replace(/\s+/g, '-').toLowerCase()}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={localValue}
        aria-valuetext={isUnlimited ? 'Unlimited' : `${localValue}${unit}`}
      />
    </Box>
  );
};

export default React.memo(EnhancedRangeSlider);
