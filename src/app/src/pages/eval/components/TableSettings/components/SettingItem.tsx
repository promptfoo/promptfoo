import React from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  Paper,
  FormControlLabel,
  Checkbox,
  Switch,
  Typography,
  Box,
  Stack,
  IconButton,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import { tokens } from '../tokens';

interface SettingItemProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ReactNode;
  tooltipText?: string;
  disabled?: boolean;
  component?: 'checkbox' | 'switch';
}

const SettingItem: React.FC<SettingItemProps> = ({
  label,
  checked,
  onChange,
  icon,
  tooltipText,
  disabled = false,
  component = 'checkbox',
}) => {
  const theme = useTheme();
  const labelId = `setting-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <Paper
      elevation={0}
      sx={{
        p: tokens.spacing.padding.item,
        mb: tokens.spacing.item,
        border: `1px solid ${alpha(theme.palette.divider, checked ? 0.25 : 0.15)}`,
        borderRadius: tokens.borderRadius.small,
        opacity: disabled ? tokens.opacity.disabled : 1,
        transition: `all ${tokens.animation.fast}ms ease`,
        backgroundColor: checked ? alpha(theme.palette.primary.main, 0.03) : 'transparent',
        '&:hover': {
          backgroundColor: disabled
            ? 'transparent'
            : alpha(theme.palette.primary.main, checked ? 0.06 : tokens.opacity.hover),
          borderColor: disabled
            ? alpha(theme.palette.divider, 0.15)
            : alpha(theme.palette.primary.main, 0.3),
          transform: disabled ? 'none' : 'translateY(-1px)',
          boxShadow: disabled ? 'none' : `0 2px 4px ${alpha(theme.palette.common.black, 0.05)}`,
        },
      }}
      role="listitem"
    >
      <FormControlLabel
        control={
          component === 'checkbox' ? (
            <Checkbox
              checked={checked}
              onChange={(e) => !disabled && onChange(e.target.checked)}
              disabled={disabled}
              sx={{
                '& .MuiSvgIcon-root': {
                  fontSize: '1.3rem',
                },
                color: theme.palette.primary.main,
                padding: tokens.spacing.padding.compact,
                marginRight: tokens.spacing.margin.element - 0.25,
                transition: `all ${tokens.animation.fast}ms ease-out`,
                '&:hover': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.08),
                },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              inputProps={{
                'aria-labelledby': labelId,
              }}
            />
          ) : (
            <Switch
              checked={checked}
              onChange={(e) => !disabled && onChange(e.target.checked)}
              disabled={disabled}
              size="small"
              sx={{
                marginRight: tokens.spacing.margin.element - 0.25,
                '& .MuiSwitch-switchBase': {
                  '&.Mui-checked': {
                    '& + .MuiSwitch-track': {
                      opacity: 0.9,
                    },
                  },
                },
                '& .MuiSwitch-track': {
                  borderRadius: 10,
                },
                '& .MuiSwitch-thumb': {
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                },
              }}
              inputProps={{
                'aria-labelledby': labelId,
              }}
            />
          )
        }
        label={
          <Stack
            direction="row"
            alignItems="center"
            spacing={tokens.spacing.stack.icon}
            sx={{
              py: tokens.spacing.padding.tiny / 2,
              width: '100%',
            }}
          >
            {icon && (
              <Box
                sx={{
                  color: theme.palette.primary.main,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 0,
                  fontSize: '1.1rem',
                  minWidth: 20,
                  marginRight: tokens.spacing.margin.tiny,
                }}
              >
                {icon}
              </Box>
            )}
            <Typography
              variant="body2"
              id={labelId}
              sx={{
                fontWeight: 400,
                color: theme.palette.text.primary,
                transition: 'color 150ms ease',
                lineHeight: 1.5,
                fontSize: '0.875rem',
                letterSpacing: '0.01em',
                paddingTop: 0,
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
                    ml: tokens.spacing.margin.tiny,
                    color:
                      theme.palette.mode === 'dark'
                        ? alpha(theme.palette.primary.light, 0.7)
                        : alpha(theme.palette.primary.main, 0.7),
                    '&:hover': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                  aria-label={`Information about ${label}`}
                >
                  <InfoOutlinedIcon sx={{ fontSize: '0.9rem' }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        }
        sx={{
          margin: 0,
          width: '100%',
          minHeight: 36,
          alignItems: 'center',
          '& .MuiFormControlLabel-label': {
            width: '100%',
            paddingTop: 0,
          },
        }}
      />
    </Paper>
  );
};

export default React.memo(SettingItem);
