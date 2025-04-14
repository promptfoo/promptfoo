import React from 'react';
import AssessmentIcon from '@mui/icons-material/Assessment';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

export const EmptyState: React.FC = () => {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
      <Paper
        elevation={3}
        sx={{
          p: 4,
          textAlign: 'center',
          maxWidth: 400,
        }}
      >
        <AssessmentIcon sx={{ fontSize: 60, mb: 2, color: 'primary.main' }} />
        <Typography variant="h5" gutterBottom>
          Welcome to Promptfoo
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Run your first evaluation and results will appear here
        </Typography>
      </Paper>
    </Box>
  );
};

export default EmptyState;
