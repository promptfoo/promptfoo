import React from 'react';
import Layout from '@theme/Layout';
import { Container, Typography } from '@mui/material';
import { HttpProviderGenerator } from '@site/src/components/HttpProviderGenerator';

export default function HttpProviderGeneratorPage(): JSX.Element {
  return (
    <Layout
      title="HTTP Provider Generator"
      description="Generate HTTP provider configurations for promptfoo"
    >
      <Container maxWidth="lg">
        <Typography variant="h3" align="center" sx={{ my: 4 }}>
          HTTP Provider Generator
        </Typography>
        <Typography variant="body1" align="center" sx={{ mb: 4 }}>
          Enter your HTTP request configuration and sample response to generate a promptfoo HTTP provider configuration.
        </Typography>
        <HttpProviderGenerator />
      </Container>
    </Layout>
  );
}
