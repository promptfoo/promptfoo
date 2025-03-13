import React from 'react';
import { Box, Typography, Stack, useTheme, Paper, alpha } from '@mui/material';
import { tokens } from '../tokens';

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  description?: string;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  children,
  icon,
  description,
}) => {
  const theme = useTheme();
  const sectionId = `section-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <Box
      sx={{
        mb: tokens.spacing.section,
        position: 'relative',
      }}
      component="section"
      aria-labelledby={sectionId}
    >
      <Paper
        elevation={0}
        sx={{
          background: alpha(
            theme.palette.background.paper,
            theme.palette.mode === 'dark' ? 0.15 : 0.3,
          ),
          borderRadius: tokens.borderRadius.medium,
          p: tokens.spacing.padding.tiny,
          mb: tokens.spacing.margin.element,
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={tokens.spacing.stack.small}
          sx={{
            px: tokens.spacing.padding.item,
            py: tokens.spacing.padding.tiny,
          }}
        >
          {icon && (
            <Box
              sx={{
                color: theme.palette.primary.main,
                display: 'flex',
                alignItems: 'center',
                fontSize: '1.25rem',
              }}
            >
              {icon}
            </Box>
          )}
          <Typography
            variant="subtitle1"
            fontWeight={600}
            id={sectionId}
            sx={{
              color:
                theme.palette.mode === 'dark'
                  ? theme.palette.primary.light
                  : theme.palette.primary.main,
              letterSpacing: '0.01em',
            }}
          >
            {title}
          </Typography>
        </Stack>
      </Paper>

      {description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mb: tokens.spacing.margin.item,
            ml: icon ? tokens.spacing.indent.tiny : 0,
            fontWeight: 400,
            maxWidth: '90%',
          }}
        >
          {description}
        </Typography>
      )}

      <Box
        sx={{
          ml: tokens.spacing.indent.tiny,
          role: 'list',
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default React.memo(SettingsSection);
