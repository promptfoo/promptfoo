import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import useIsBrowser from '@docusaurus/useIsBrowser';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Layout from '@theme/Layout';

const FeedbackPageContent = () => {
  const isBrowser = useIsBrowser();
  const { colorMode } = useColorMode();

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: colorMode === 'dark' ? 'dark' : 'light',
          primary: {
            main: '#0066cc',
          },
        },
      }),
    [colorMode],
  );

  const iframeStyle: React.CSSProperties = {
    width: '100%',
    height: '1100px',
    border: 0,
    borderRadius: '8px',
    overflow: 'hidden',
  };

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
            We'd love your feedback
          </Typography>
          <Typography
            variant="h6"
            color="text.secondary"
            sx={{ maxWidth: '600px', mx: 'auto', lineHeight: 1.6 }}
          >
            Help us improve Promptfoo by sharing your thoughts and suggestions
          </Typography>
        </Box>

        <Box
          sx={{
            boxShadow:
              colorMode === 'dark'
                ? '0 4px 20px rgba(0, 0, 0, 0.3)'
                : '0 4px 20px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            overflow: 'hidden',
            mb: 4,
          }}
        >
          <iframe
            src="https://docs.google.com/forms/d/e/1FAIpQLScAnqlqX-ep-aOn6umjXXDVafc1sLTOEd5W6rMAPKllLk0CIA/viewform?embedded=1"
            title="PromptFoo Feedback Form"
            sandbox="allow-scripts allow-forms allow-same-origin"
            style={iframeStyle}
            loading="lazy"
            scrolling="no"
          >
            Loading…
          </iframe>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

const Feedback = () => {
  return (
    <Layout title="Feedback" description="Share your feedback and help us improve Promptfoo">
      <FeedbackPageContent />
    </Layout>
  );
};

export default Feedback;
