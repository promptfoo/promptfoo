import React from 'react';

import Head from '@docusaurus/Head';
import { useColorMode } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Layout from '@theme/Layout';
import styles from './contact.module.css';

function Contact(): React.ReactElement {
  const isDarkTheme = useColorMode().colorMode === 'dark';

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDarkTheme ? 'dark' : 'light',
          primary: {
            main: '#0066cc',
          },
        },
      }),
    [isDarkTheme],
  );

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', py: 4, mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 600 }}>
            Contact Promptfoo
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Tell us what you're working on and we'll follow up with the right team
          </Typography>
        </Box>

        <Box className={styles.mainLayout}>
          <Box className={styles.contactColumn}>
            <form action="https://submit-form.com/ghriv7voL" className={styles.contactForm}>
              <Box className={styles.formGrid}>
                <TextField
                  fullWidth
                  id="name"
                  name="name"
                  label="Full Name"
                  variant="outlined"
                  required
                  margin="normal"
                  size="small"
                />
                <TextField
                  fullWidth
                  id="email"
                  name="email"
                  label="Work Email"
                  type="email"
                  variant="outlined"
                  required
                  margin="normal"
                  size="small"
                  helperText="Use your company email"
                />
              </Box>

              <Box className={styles.formGrid}>
                <TextField
                  fullWidth
                  id="company"
                  name="company"
                  label="Company"
                  variant="outlined"
                  required
                  margin="normal"
                  size="small"
                />
                <TextField
                  fullWidth
                  id="title"
                  name="title"
                  label="Job Title"
                  variant="outlined"
                  margin="normal"
                  size="small"
                />
              </Box>

              <FormControl fullWidth margin="normal" variant="outlined" required size="small">
                <InputLabel id="interested-in-label">I'm interested in</InputLabel>
                <Select
                  labelId="interested-in-label"
                  id="interested-in"
                  name="interested-in"
                  label="I'm interested in"
                >
                  <MenuItem value="Enterprise Security">Enterprise Security & Red Teaming</MenuItem>
                  <MenuItem value="AI Guardrails">AI Guardrails & Compliance</MenuItem>
                  <MenuItem value="Model Evaluation">Model Evaluation & Testing</MenuItem>
                  <MenuItem value="Custom Solution">Custom Enterprise Solution</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                id="message"
                name="message"
                label="How can we help?"
                multiline
                rows={4}
                variant="outlined"
                required
                margin="normal"
                size="small"
              />

              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  sx={{
                    px: 4,
                    py: 1,
                    textTransform: 'none',
                    fontWeight: 500,
                  }}
                >
                  Send Message
                </Button>
              </Box>
            </form>
          </Box>

          <Box className={styles.socialProofColumn}>
            <Box className={styles.trustedBySection}>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.75rem' }}
              >
                Trusted by leading teams
              </Typography>
              <Box className={styles.logoGrid}>
                <img
                  src="/img/brands/shopify-logo.svg"
                  alt="Shopify"
                  className={styles.brandLogo}
                />
                <img
                  src="/img/brands/anthropic-logo.svg"
                  alt="Anthropic"
                  className={styles.brandLogo}
                />
                <img
                  src="/img/brands/microsoft-logo.svg"
                  alt="Microsoft"
                  className={styles.brandLogo}
                />
                <img
                  src="/img/brands/discord-logo-blue.svg"
                  alt="Discord"
                  className={styles.brandLogo}
                />
                <img
                  src="/img/brands/doordash-logo.svg"
                  alt="Doordash"
                  className={styles.brandLogo}
                />
                <img
                  src="/img/brands/carvana-logo.svg"
                  alt="Carvana"
                  className={styles.brandLogo}
                />
              </Box>
            </Box>

            <Box className={styles.testimonialsSection}>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.75rem' }}
              >
                What users say
              </Typography>

              <Box className={styles.testimonialItem}>
                <Box className={styles.testimonialHeader}>
                  <img
                    src="/img/brands/openai-logo.svg"
                    alt="OpenAI"
                    className={styles.openaiTestimonialLogo}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Build Hours
                  </Typography>
                </Box>
                <Typography variant="body2" className={styles.testimonialQuote}>
                  "Promptfoo is really powerful... it's faster and more straightforward"
                </Typography>
                <Link
                  href="https://vimeo.com/1023317525/be082a1029"
                  target="_blank"
                  className={styles.testimonialLink}
                  sx={{ fontSize: '0.75rem', fontWeight: 500, textDecoration: 'none' }}
                >
                  Watch video →
                </Link>
              </Box>

              <Box className={styles.testimonialItem}>
                <Box className={styles.testimonialHeader}>
                  <img
                    src="/img/brands/anthropic-logo.svg"
                    alt="Anthropic"
                    className={styles.anthropicTestimonialLogo}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Courses
                  </Typography>
                </Box>
                <Typography variant="body2" className={styles.testimonialQuote}>
                  "A streamlined solution that significantly reduces testing effort"
                </Typography>
                <Link
                  href="https://github.com/anthropics/courses/tree/master/prompt_evaluations"
                  target="_blank"
                  className={styles.testimonialLink}
                  sx={{ fontSize: '0.75rem', fontWeight: 500, textDecoration: 'none' }}
                >
                  See course →
                </Link>
              </Box>

              <Box className={styles.testimonialItem}>
                <Box className={styles.testimonialHeader}>
                  <img
                    src="/img/brands/aws-logo.svg"
                    alt="AWS"
                    className={styles.awsTestimonialLogo}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Workshops
                  </Typography>
                </Box>
                <Typography variant="body2" className={styles.testimonialQuote}>
                  "Promptfoo works particularly well with Amazon Bedrock"
                </Typography>
                <Link
                  href="https://catalog.workshops.aws/promptfoo/"
                  target="_blank"
                  className={styles.testimonialLink}
                  sx={{ fontSize: '0.75rem', fontWeight: 500, textDecoration: 'none' }}
                >
                  View workshop →
                </Link>
              </Box>
            </Box>

            <Box className={styles.quickLinks}>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.75rem' }}
              >
                Quick links
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Link
                  href="https://discord.gg/promptfoo"
                  target="_blank"
                  className={styles.quickLink}
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 400,
                    color: 'text.secondary',
                    textDecoration: 'none',
                  }}
                >
                  💬 Join Discord Community
                </Link>
                <Link
                  href="https://github.com/promptfoo/promptfoo"
                  target="_blank"
                  className={styles.quickLink}
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 400,
                    color: 'text.secondary',
                    textDecoration: 'none',
                  }}
                >
                  🐙 View on GitHub
                </Link>
                <Link
                  href="mailto:inquiries@promptfoo.dev"
                  className={styles.quickLink}
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 400,
                    color: 'text.secondary',
                    textDecoration: 'none',
                  }}
                >
                  📧 inquiries@promptfoo.dev
                </Link>
              </Box>
            </Box>
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  );
}

export default function Page(): React.ReactElement {
  const { siteConfig } = useDocusaurusContext();
  const siteUrl = siteConfig.url;

  return (
    <Layout
      title="Contact Enterprise Sales"
      description="Contact Promptfoo about enterprise AI security solutions, red teaming, guardrails, and compliance."
    >
      <Head>
        <meta property="og:title" content="Contact Promptfoo" />
        <meta
          property="og:description"
          content="Contact Promptfoo about enterprise AI security solutions, red teaming, guardrails, and compliance."
        />
        <meta property="og:image" content={`${siteUrl}/img/og/contact-og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${siteUrl}/contact`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Contact Promptfoo" />
        <meta
          name="twitter:description"
          content="Contact Promptfoo about enterprise AI security solutions, red teaming, guardrails, and compliance."
        />
        <meta name="twitter:image" content={`${siteUrl}/img/og/contact-og.png`} />
        <link rel="canonical" href={`${siteUrl}/contact`} />
      </Head>
      <Contact />
    </Layout>
  );
}
