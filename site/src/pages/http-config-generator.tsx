import React from 'react';
import { Container, Typography } from '@mui/material';
import { HttpConfigGenerator } from '@site/src/components/HttpConfigGenerator';
import Layout from '@theme/Layout';

export default function HttpConfigGeneratorPage(): JSX.Element {
  return (
    <Layout title="HTTP Config Generator" description="Generate HTTP configurations for Promptfoo">
      <Container maxWidth="lg">
        <Typography variant="h3" align="center" sx={{ my: 4 }}>
          HTTP Config Generator
        </Typography>
        <Typography variant="body1" align="center" sx={{ mb: 4 }}>
          Enter your HTTP request configuration and sample response to generate a Promptfoo HTTP
          configuration.
        </Typography>
        <HttpConfigGenerator />
      </Container>
    </Layout>
  );
}
