import React from 'react';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Layout from '@theme/Layout';

const PressContent = () => {
  const { colorMode } = useColorMode();

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: colorMode === 'dark' ? 'dark' : 'light',
        },
      }),
    [colorMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg">
        <Box py={8}>
          <Typography variant="h2" component="h1" align="center" gutterBottom fontWeight="bold">
            Press Center
          </Typography>
          <Typography variant="h5" component="h2" align="center" color="text.secondary" paragraph>
            Resources and information for media coverage of Promptfoo
          </Typography>
        </Box>

        {/* Company Overview Section */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            About Promptfoo
          </Typography>
          <Typography variant="body1" paragraph>
            Promptfoo is a leading provider of AI security solutions, helping developers and
            enterprises build secure, reliable AI applications. Based in San Mateo, California,
            Promptfoo is backed by Andreessen Horowitz and top leaders in the technology and
            security industries.
          </Typography>
          <Typography variant="body1" paragraph>
            Our core product is an open-source pentesting and evaluation framework used by tens of
            thousands of developers. Promptfoo is among the most popular evaluation frameworks and
            is the first product to adapt AI-specific pentesting techniques to your application.
          </Typography>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Press Coverage Section */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Recent Coverage
          </Typography>
          <Grid container spacing={4}>
            {[
              {
                title: 'Securing the Future of AI Applications',
                publication: 'TechCrunch',
                date: 'January 2024',
                description:
                  'An in-depth look at how Promptfoo is revolutionizing AI security testing.',
                link: '#',
              },
              {
                title: 'The AI Security Podcast',
                publication: 'Software Engineering Daily',
                date: 'December 2023',
                description: "Interview with Promptfoo's founders on the future of AI security.",
                link: '#',
              },
              {
                title: 'Open Source AI Security Tools',
                publication: 'InfoQ',
                date: 'November 2023',
                description: "Feature coverage of Promptfoo's open source framework.",
                link: '#',
              },
            ].map((coverage) => (
              <Grid item xs={12} md={4} key={coverage.title}>
                <Box>
                  <Typography variant="h6" component="h4" gutterBottom>
                    {coverage.title}
                  </Typography>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {coverage.publication} • {coverage.date}
                  </Typography>
                  <Typography variant="body2" paragraph>
                    {coverage.description}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Brand Assets Section */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Brand Assets
          </Typography>
          <Typography variant="body1" paragraph>
            Download official Promptfoo logos and brand assets for media use.
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 3,
                  textAlign: 'center',
                }}
              >
                <img
                  src="/img/logo-panda.svg"
                  alt="Promptfoo Logo"
                  style={{ maxWidth: '200px', height: 'auto' }}
                />
                <Typography variant="subtitle1" mt={2}>
                  Promptfoo Logo (SVG)
                </Typography>
                <Link href="/img/logo-panda.svg" download>
                  Download
                </Link>
              </Box>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Media Contact Section */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Media Contact
          </Typography>
          <Typography variant="body1" paragraph>
            For press inquiries, please contact our media relations team:
          </Typography>
          <Typography variant="body1" paragraph>
            <Link href="mailto:press@promptfoo.dev">press@promptfoo.dev</Link>
          </Typography>
          <Typography variant="body1" paragraph>
            For urgent inquiries, please include "URGENT" in the subject line.
          </Typography>
        </Box>

        {/* Company Facts Section */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Quick Facts
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" component="h4" gutterBottom>
                Founded
              </Typography>
              <Typography variant="body1" paragraph>
                2023
              </Typography>
              <Typography variant="h6" component="h4" gutterBottom>
                Headquarters
              </Typography>
              <Typography variant="body1" paragraph>
                San Mateo, California
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" component="h4" gutterBottom>
                Leadership
              </Typography>
              <Typography variant="body1" paragraph>
                Ian Webster, CEO & Co-founder
                <br />
                Michael D'Angelo, CTO & Co-founder
              </Typography>
              <Typography variant="h6" component="h4" gutterBottom>
                Investors
              </Typography>
              <Typography variant="body1" paragraph>
                Andreessen Horowitz and industry leaders
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

const PressPage = () => {
  return (
    <Layout
      title="Press | Promptfoo"
      description="Press resources and media information for Promptfoo - Leading the future of AI security testing."
    >
      <PressContent />
    </Layout>
  );
};

export default PressPage;
