import React from 'react';
import { Security as SecurityIcon } from '@mui/icons-material';
import { Button, Container, Paper, Typography } from '@mui/material';

export default function InstallationCheck() {
  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Paper sx={{ p: 6, textAlign: 'center' }}>
        <SecurityIcon sx={{ fontSize: 64, color: 'error.main', mb: 3 }} />
        <Typography variant="h4" gutterBottom fontWeight={600}>
          ModelAudit Not Installed
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          The ModelAudit Python package is required to scan ML models for security vulnerabilities.
        </Typography>
        <Paper sx={{ p: 3, bgcolor: 'grey.100', maxWidth: 500, mx: 'auto', my: 3 }}>
          <Typography variant="body1" fontFamily="monospace" fontWeight={500}>
            pip install modelaudit
          </Typography>
        </Paper>
        <Button
          variant="contained"
          href="https://www.promptfoo.dev/docs/model-audit/"
          target="_blank"
          rel="noopener noreferrer"
        >
          View Documentation
        </Button>
      </Paper>
    </Container>
  );
}
