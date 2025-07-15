import React from 'react';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import DownloadIcon from '@mui/icons-material/Download';
import EmailIcon from '@mui/icons-material/Email';
import BusinessIcon from '@mui/icons-material/Business';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Layout from '@theme/Layout';
import LogoPanda from '../../static/img/logo-panda.svg';
import styles from './press.module.css';

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

  const recentCoverage = [
    {
      date: 'January 2025',
      title: 'DeepSeek AI Censorship Research',
      description: 'Major media coverage of our groundbreaking research on AI censorship',
      highlight: true,
      link: '/blog/deepseek-censorship/',
      outlets: [
        'Ars Technica',
        'TechCrunch',
        'Stanford Cyber Policy Center',
        'The Independent',
        'Washington Times',
        'and 5+ more',
      ],
    },
    {
      date: 'August 2024',
      title: 'Series A Funding Announcement',
      description: 'Promptfoo raises funding from Andreessen Horowitz to democratize AI security',
      link: 'https://a16z.com/companies/promptfoo/',
      outlets: ['VentureBeat', 'TechCrunch', 'SecurityWeek'],
    },
  ];

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg">
        <Box py={8}>
          <Typography variant="h2" component="h1" align="center" gutterBottom fontWeight="bold">
            Press Center
          </Typography>
          <Typography variant="h5" component="h2" align="center" color="text.secondary" paragraph>
            Media resources and press information
          </Typography>
        </Box>

        {/* Quick Actions for Journalists */}
        <Paper elevation={1} sx={{ p: 4, mb: 6 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                href="/media-kit.zip"
                fullWidth
                size="large"
              >
                Download Press Kit
              </Button>
            </Grid>
            <Grid item xs={12} md={4}>
              <Button
                variant="outlined"
                startIcon={<EmailIcon />}
                href="mailto:press@promptfoo.dev"
                fullWidth
                size="large"
              >
                Press Inquiries
              </Button>
            </Grid>
            <Grid item xs={12} md={4}>
              <Button
                variant="outlined"
                startIcon={<BusinessIcon />}
                href="/about"
                fullWidth
                size="large"
              >
                Company Information
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {/* Company Boilerplate */}
        <Paper elevation={0} sx={{ p: 4, mb: 6, bgcolor: 'action.hover' }}>
          <Typography variant="h6" gutterBottom>
            About Promptfoo
          </Typography>
          <Typography variant="body1">
            Promptfoo is the industry-leading open-source platform for AI security and evaluation,
            trusted by over 100,000 developers worldwide. Founded in 2024 and backed by Andreessen
            Horowitz, Promptfoo pioneered AI-specific pentesting techniques that help organizations
            build secure, reliable AI applications. The company is headquartered in San Francisco,
            California.
          </Typography>
        </Paper>

        {/* Recent Coverage */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Recent Coverage
          </Typography>
          <Grid container spacing={3}>
            {recentCoverage.map((coverage, idx) => (
              <Grid item xs={12} key={idx}>
                <Paper
                  elevation={coverage.highlight ? 2 : 1}
                  sx={{
                    p: 3,
                    ...(coverage.highlight && {
                      borderLeft: '4px solid',
                      borderColor: 'primary.main',
                    }),
                  }}
                >
                  <Box
                    sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="overline" color="text.secondary">
                        {coverage.date}
                      </Typography>
                      <Typography variant="h6" gutterBottom>
                        {coverage.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" paragraph>
                        {coverage.description}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Featured in: {coverage.outlets.join(', ')}
                      </Typography>
                    </Box>
                    {coverage.link && (
                      <Box sx={{ ml: 2 }}>
                        <Link href={coverage.link}>
                          <Button variant="text" size="small">
                            View →
                          </Button>
                        </Link>
                      </Box>
                    )}
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              For a complete list of media coverage and podcasts, visit our{' '}
              <Link href="/community">Community page</Link>
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 6 }} />

        {/* Brand Assets */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Brand Assets
          </Typography>
          <Typography variant="body1" paragraph>
            Download official Promptfoo logos and brand assets for media use.
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper elevation={1} sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                <LogoPanda style={{ maxWidth: '120px', height: 'auto', marginBottom: '1rem' }} />
                <Typography variant="subtitle1" gutterBottom>
                  Logo (SVG)
                </Typography>
                <Button size="small" href="/img/logo-panda.svg" download>
                  Download
                </Button>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper elevation={1} sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                <Box
                  sx={{
                    width: '120px',
                    height: '120px',
                    bgcolor: 'action.hover',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="caption">High-res</Typography>
                </Box>
                <Typography variant="subtitle1" gutterBottom>
                  Logo (PNG)
                </Typography>
                <Button size="small" href="/img/logo-panda-highres.png" download>
                  Download
                </Button>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper elevation={1} sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                <Box
                  sx={{
                    width: '120px',
                    height: '120px',
                    bgcolor: 'action.hover',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="caption">Screenshots</Typography>
                </Box>
                <Typography variant="subtitle1" gutterBottom>
                  Product Screenshots
                </Typography>
                <Button size="small" href="/media-kit.zip">
                  Download All
                </Button>
              </Paper>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 6 }} />

        {/* Contact Information */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Media Contact
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Paper elevation={0} sx={{ p: 3, bgcolor: 'background.paper' }}>
                <Typography variant="h6" gutterBottom>
                  Press Inquiries
                </Typography>
                <Typography variant="body1" paragraph>
                  <Link href="mailto:press@promptfoo.dev">press@promptfoo.dev</Link>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  For urgent requests, include "URGENT" in subject line. Response time: 1-2 business
                  days.
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper elevation={0} sx={{ p: 3, bgcolor: 'background.paper' }}>
                <Typography variant="h6" gutterBottom>
                  Spokesperson
                </Typography>
                <Typography variant="body1" paragraph>
                  Ian Webster, CEO & Co-founder
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Available for interviews on AI security, red teaming, and the future of AI safety.
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Box>

        {/* Quick Facts */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" gutterBottom fontWeight="medium">
            Quick Facts
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={6} md={3}>
              <Typography variant="h6">Founded</Typography>
              <Typography variant="body1">2024</Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography variant="h6">Headquarters</Typography>
              <Typography variant="body1">San Francisco, CA</Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography variant="h6">Funding</Typography>
              <Typography variant="body1">Series A (a16z)</Typography>
            </Grid>
            <Grid item xs={6} md={3}>
              <Typography variant="h6">Users</Typography>
              <Typography variant="body1">100,000+ developers</Typography>
            </Grid>
          </Grid>
        </Box>

        {/* Additional Resources */}
        <Paper elevation={0} sx={{ p: 4, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
          <Typography variant="h5" gutterBottom align="center">
            Looking for more?
          </Typography>
          <Typography variant="body1" paragraph align="center">
            Visit our{' '}
            <Link href="/community" style={{ color: 'inherit' }}>
              Community page
            </Link>{' '}
            for educational resources, research papers, podcasts, and testimonials.
          </Typography>
        </Paper>
      </Container>
    </ThemeProvider>
  );
};

const PressPage = () => {
  return (
    <Layout
      title="Press Center | Promptfoo"
      description="Media resources, press kit, and contact information for journalists covering Promptfoo."
    >
      <PressContent />
    </Layout>
  );
};

export default PressPage;
