import React from 'react';

import Head from '@docusaurus/Head';
import { useColorMode } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Layout from '@theme/Layout';
import styles from './contact.module.css';

const testimonials = [
  {
    href: 'https://vimeo.com/1023317525/be082a1029',
    logo: '/img/brands/openai-logo.svg',
    logoAlt: 'OpenAI',
    logoClassName: styles.openaiTestimonialLogo,
    quote: 'Promptfoo is really powerful. It is faster and more straightforward.',
    source: 'Build Hours',
    cta: 'Watch video',
  },
  {
    href: 'https://github.com/anthropics/courses/tree/master/prompt_evaluations',
    logo: '/img/brands/anthropic-logo.svg',
    logoAlt: 'Anthropic',
    logoClassName: styles.anthropicTestimonialLogo,
    quote: 'A streamlined solution that significantly reduces testing effort.',
    source: 'Courses',
    cta: 'See course',
  },
  {
    href: 'https://catalog.workshops.aws/promptfoo/',
    logo: '/img/brands/aws-logo.svg',
    logoAlt: 'AWS',
    logoClassName: styles.awsTestimonialLogo,
    quote: 'Promptfoo works particularly well with Amazon Bedrock.',
    source: 'Workshops',
    cta: 'View workshop',
  },
];

function Contact(): React.ReactElement {
  const isDarkTheme = useColorMode().colorMode === 'dark';

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDarkTheme ? 'dark' : 'light',
          primary: {
            main: isDarkTheme ? '#ff7a7a' : '#e53a3a',
            dark: isDarkTheme ? '#e53a3a' : '#cb3434',
            contrastText: isDarkTheme ? '#10191c' : '#ffffff',
          },
        },
      }),
    [isDarkTheme],
  );

  return (
    <ThemeProvider theme={theme}>
      <Box className={styles.pageWrapper}>
        <Container maxWidth="lg">
          <Box className={styles.heroSection}>
            <Chip label="Enterprise" className={styles.heroChip} size="small" />
            <Typography variant="h2" component="h1" className={styles.heroTitle}>
              Talk to our AI security team
            </Typography>
            <Typography variant="h6" className={styles.heroSubtitle}>
              We help security, platform, and ML teams evaluate risk, enforce policy, and ship
              reliable AI applications.
            </Typography>
          </Box>

          <Box className={styles.mainLayout}>
            <Paper className={styles.contactCard} elevation={0}>
              <Box className={styles.cardHeader}>
                <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
                  Request a demo
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Tell us about your environment and what you want to accomplish.
                </Typography>
              </Box>

              <form action="https://submit-form.com/ghriv7voL" className={styles.contactForm}>
                <Box className={styles.formGrid}>
                  <TextField
                    fullWidth
                    id="name"
                    name="name"
                    label="Full name"
                    variant="outlined"
                    required
                    margin="normal"
                  />
                  <TextField
                    fullWidth
                    id="email"
                    name="email"
                    label="Work email"
                    type="email"
                    variant="outlined"
                    required
                    margin="normal"
                    helperText="Please use your company email address"
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
                  />
                  <TextField
                    fullWidth
                    id="title"
                    name="title"
                    label="Job title"
                    variant="outlined"
                    margin="normal"
                  />
                </Box>

                <FormControl fullWidth margin="normal" variant="outlined" required>
                  <InputLabel id="interested-in-label">I'm interested in</InputLabel>
                  <Select
                    labelId="interested-in-label"
                    id="interested-in"
                    name="interested-in"
                    label="I'm interested in"
                  >
                    <MenuItem value="Enterprise Security">
                      Enterprise Security & Red Teaming
                    </MenuItem>
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
                  rows={5}
                  variant="outlined"
                  required
                  margin="normal"
                  placeholder="Share a few details about your application, timeline, and deployment requirements."
                />

                <Box className={styles.submitRow}>
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    endIcon={<ArrowForwardIcon />}
                    sx={{
                      px: 4,
                      py: 1.5,
                      textTransform: 'none',
                      fontWeight: 600,
                    }}
                  >
                    Contact sales
                  </Button>
                  <Typography variant="body2" color="text.secondary">
                    Or email{' '}
                    <Link
                      href="mailto:inquiries@promptfoo.dev"
                      underline="hover"
                      className={styles.emailLink}
                    >
                      inquiries@promptfoo.dev
                    </Link>
                  </Typography>
                </Box>
              </form>
            </Paper>

            <Box className={styles.sidebarColumn}>
              <Paper className={styles.sidebarCard} elevation={0}>
                <Typography variant="h6" sx={{ fontWeight: 600, marginBottom: '1rem' }}>
                  Trusted by leading teams
                </Typography>
                <Box className={styles.logoGrid}>
                  <Box className={styles.logoItem}>
                    <img
                      src="/img/brands/shopify-logo.svg"
                      alt="Shopify"
                      className={`${styles.brandLogo} ${styles.shopifyLogo}`}
                    />
                  </Box>
                  <Box className={styles.logoItem}>
                    <img
                      src="/img/brands/anthropic-logo.svg"
                      alt="Anthropic"
                      className={`${styles.brandLogo} ${styles.anthropicLogo}`}
                    />
                  </Box>
                  <Box className={styles.logoItem}>
                    <img
                      src="/img/brands/microsoft-logo.svg"
                      alt="Microsoft"
                      className={`${styles.brandLogo} ${styles.microsoftLogo}`}
                    />
                  </Box>
                  <Box className={styles.logoItem}>
                    <img
                      src="/img/brands/discord-logo-blue.svg"
                      alt="Discord"
                      className={`${styles.brandLogo} ${styles.discordLogo}`}
                    />
                  </Box>
                  <Box className={styles.logoItem}>
                    <img
                      src="/img/brands/doordash-logo.svg"
                      alt="DoorDash"
                      className={`${styles.brandLogo} ${styles.doordashLogo}`}
                    />
                  </Box>
                  <Box className={styles.logoItem}>
                    <img
                      src="/img/brands/carvana-logo.svg"
                      alt="Carvana"
                      className={`${styles.brandLogo} ${styles.carvanaLogo}`}
                    />
                  </Box>
                </Box>
              </Paper>

              <Paper className={styles.sidebarCard} elevation={0}>
                <Typography variant="h6" sx={{ fontWeight: 600, marginBottom: '1rem' }}>
                  What users say
                </Typography>
                <Box className={styles.testimonialList}>
                  {testimonials.map((testimonial) => (
                    <Box key={testimonial.source} className={styles.testimonialItem}>
                      <Box className={styles.testimonialHeader}>
                        <img
                          src={testimonial.logo}
                          alt={testimonial.logoAlt}
                          className={testimonial.logoClassName}
                        />
                        <Typography variant="body2" className={styles.testimonialSource}>
                          {testimonial.source}
                        </Typography>
                      </Box>
                      <Typography variant="body2" className={styles.testimonialQuote}>
                        "{testimonial.quote}"
                      </Typography>
                      <Link
                        href={testimonial.href}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.testimonialLink}
                        underline="none"
                      >
                        {testimonial.cta}
                        <ArrowForwardIcon className={styles.testimonialLinkIcon} />
                      </Link>
                    </Box>
                  ))}
                </Box>
              </Paper>

              <Paper className={styles.sidebarCard} elevation={0}>
                <Typography variant="h6" sx={{ fontWeight: 600, marginBottom: '1rem' }}>
                  Resources
                </Typography>
                <Box className={styles.resourceLinks}>
                  <Link
                    href="https://github.com/promptfoo/promptfoo"
                    target="_blank"
                    rel="noreferrer"
                    className={styles.resourceLink}
                    underline="none"
                  >
                    GitHub
                    <ArrowForwardIcon className={styles.resourceLinkIcon} />
                  </Link>
                  <Link
                    href="https://discord.gg/promptfoo"
                    target="_blank"
                    rel="noreferrer"
                    className={styles.resourceLink}
                    underline="none"
                  >
                    Discord community
                    <ArrowForwardIcon className={styles.resourceLinkIcon} />
                  </Link>
                  <Link href="/docs/enterprise" className={styles.resourceLink} underline="none">
                    Enterprise documentation
                    <ArrowForwardIcon className={styles.resourceLinkIcon} />
                  </Link>
                </Box>
              </Paper>
            </Box>
          </Box>
        </Container>
      </Box>
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
