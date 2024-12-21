import React from 'react';
import { Box, ListItem, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { EnhancedCodeBlock } from '../components/EnhancedCodeBlock';
import { StyledPaper } from '../styles';
import type { TestExampleProps } from '../types';
import { getPromptDisplayString, getOutputDisplay } from '../utils/formatters';

const TestExample: React.FC<TestExampleProps> = ({ prompt, output, type, onClick }) => {
  const theme = useTheme();

  return (
    <StyledPaper
      elevation={1}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.();
        }
      }}
      sx={{
        transition: 'all 0.2s ease-in-out',
        cursor: 'pointer',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: theme.shadows[4],
        },
        borderLeft: `4px solid ${
          type === 'failure' ? theme.palette.error.main : theme.palette.success.main
        }`,
      }}
    >
      <ListItem
        sx={{
          flexDirection: 'column',
          alignItems: 'flex-start',
          p: 2,
          gap: 2,
        }}
      >
        <Box sx={{ width: '100%' }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            gutterBottom
            sx={{
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            Prompt:
          </Typography>
          <EnhancedCodeBlock
            variant="body2"
            sx={{ mb: 2 }}
            content={getPromptDisplayString(prompt)}
          />
          <Typography
            variant="subtitle2"
            color={type === 'failure' ? 'error' : 'success'}
            gutterBottom
            sx={{
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            Response:
          </Typography>
          <EnhancedCodeBlock variant="body2" content={getOutputDisplay(output)} />
        </Box>
      </ListItem>
    </StyledPaper>
  );
};

export default TestExample;
