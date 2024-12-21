import React from 'react';
import { Box, ListItem, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import EnhancedCodeBlock from '../../../components/EnhancedCodeBlock';
import { StyledPaper } from '../../../styles/StyledPaper';
import type { FunctionCallOutput } from '../../../types/types';
import { getPromptDisplayString, getOutputDisplay } from '../../../utils/utils';

interface TestExampleProps {
  prompt: string;
  output: string | FunctionCallOutput[] | object;
  type: 'pass' | 'failure';
}

const TestExample: React.FC<TestExampleProps> = ({ prompt, output, type }) => {
  const theme = useTheme();

  return (
    <StyledPaper
      elevation={1}
      sx={{
        transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: theme.shadows[4],
        },
      }}
    >
      <ListItem
        sx={{
          flexDirection: 'column',
          alignItems: 'flex-start',
          p: 2,
        }}
      >
        <Box sx={{ width: '100%' }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            gutterBottom
            sx={{ fontWeight: 'bold' }}
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
            sx={{ fontWeight: 'bold' }}
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
