import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import useIsBrowser from '@docusaurus/useIsBrowser';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Layout from '@theme/Layout';

export default function Feedback(): JSX.Element {
  const isBrowser = useIsBrowser();
  const { colorMode } = isBrowser ? useColorMode() : { colorMode: 'light' };
  const iframeStyle: React.CSSProperties = {
    width: '100%',
    height: '800px',
    border: 0,
    backgroundColor: colorMode === 'dark' ? '#fff' : undefined,
  };

  return (
    <Layout title="Feedback">
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Typography variant="h3" component="h1" align="center" gutterBottom>
          We'd love your feedback
        </Typography>
        <Box mt={4}>
          <iframe
            src="https://docs.google.com/forms/d/e/1FAIpQLScAnqlqX-ep-aOn6umjXXDVafc1sLTOEd5W6rMAPKllLk0CIA/viewform?embedded=1"
            style={iframeStyle}
            loading="lazy"
          >
            Loading…
          </iframe>
        </Box>
      </Container>
    </Layout>
  );
}
