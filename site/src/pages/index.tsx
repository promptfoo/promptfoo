import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import CompareIcon from '@mui/icons-material/Compare';
import DescriptionIcon from '@mui/icons-material/Description';
import SecurityIcon from '@mui/icons-material/Security';
import { Box, Button, Container, Stack, Typography, ThemeProvider, Grid } from '@mui/material';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HomepageInfo from '@site/src/components/HomepageInfo';
import LogoContainer from '@site/src/components/LogoContainer';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import NewsletterForm from '../components/NewsletterForm';
import ResponsiveImage from '../components/ResponsiveImage';
import WalkthroughTab from '../components/WalkthroughTab';
import theme from '../theme';
import styles from './index.module.css';

function HomepageHeader({ getStartedUrl }: { getStartedUrl: string }) {
  return (
    <Box
      component="header"
      className={clsx('hero hero--primary', styles.heroBanner)}
      sx={{
        padding: { xs: 2, md: 4 },
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Container maxWidth="lg">
        <Typography component="h1" className="hero-title" sx={{ marginBottom: { xs: 2, md: 4 } }}>
          Test & secure your LLM apps
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: '1.125rem', md: '1.25rem' },
            mb: { xs: 2, md: 4 },
            fontWeight: 'normal',
          }}
        >
          Open-source LLM testing used by 60,000+ developers
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems="center"
          justifyContent="center"
        >
          <Button
            component={Link}
            to={getStartedUrl}
            variant="contained"
            size="large"
            className="button button--primary button--lg"
          >
            Get Started
          </Button>
          <Button
            component={Link}
            to="/contact/"
            variant="outlined"
            size="large"
            className="button button--secondary button--lg"
          >
            Request a Demo
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}

function HomepageWalkthrough() {
  const isDarkTheme = useColorMode().colorMode === 'dark';
  const [selectedStep, setSelectedStep] = React.useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#evals') {
      return 1;
    }
    return 2;
  });
  const steps = [
    {
      id: 1,
      caption: 'Evaluations',
      image: '/img/claude-vs-gpt-example.png',
      image2x: '/img/claude-vs-gpt-example@2x.png',
      imageDark: '/img/claude-vs-gpt-example-dark.png',
      image2xDark: '/img/claude-vs-gpt-example-dark@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Build reliable prompts, RAGs, and agents</p>
          <p>Start testing the performance of your models, prompts, and tools in minutes:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest init</code>
          </pre>
          <p>
            Promptfoo runs locally and integrates directly with your app - no SDKs, cloud
            dependencies, or logins.
          </p>
          <p>
            <strong>
              <Link to="/docs/intro">&raquo; Get Started</Link>
            </strong>
          </p>
        </>
      ),
      icon: <CompareIcon />,
      destinationUrl: '/docs/intro',
    },
    {
      id: 2,
      caption: 'Security & Red Teaming',
      image: '/img/riskreport-1.png',
      image2x: '/img/riskreport-1@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Automated red teaming for gen AI</p>
          <p>Run custom scans that detect security, legal, and brand risk:</p>
          <pre className={styles.codeBox}>
            <code>npx promptfoo@latest redteam init</code>
          </pre>
          <p>Our probes adapt dynamically to your app and uncover common failures like:</p>
          <ul>
            <li>PII leaks</li>
            <li>Insecure tool use</li>
            <li>Cross-session data leaks</li>
            <li>Direct and indirect prompt injections</li>
            <li>Jailbreaks</li>
            <li>Harmful content</li>
            <li>Specialized medical and legal advice</li>
            <li>
              and <Link to="/docs/red-team/llm-vulnerability-types/">much more</Link>
            </li>
          </ul>
          <p>
            <strong>
              <Link to="/docs/red-team/quickstart/">&raquo; Find exploits in your LLM app</Link>
            </strong>
          </p>
        </>
      ),
      icon: <SecurityIcon />,
      destinationUrl: '/docs/red-team/quickstart/',
    },
    {
      id: 3,
      caption: 'Continuous Monitoring',
      image: '/img/continuous-monitoring.png',
      image2x: '/img/continuous-monitoring@2x.png',
      description: (
        <>
          <p className={styles.walkthroughHeading}>Spot issues before they're deployed</p>
          <p>
            Promptfoo provides a high-level view of your system's security posture across different
            models, prompts, and applications.
          </p>
          <p>
            Our simple file-based config and local runtime make it easy to set up in{' '}
            <Link to="/docs/integrations/github-action/">GitHub Actions</Link> or other CI/CD
            services.
          </p>
          <p>
            <strong>
              <Link to="/docs/red-team/quickstart/">&raquo; See setup docs</Link>
            </strong>
          </p>
        </>
      ),
      icon: <DescriptionIcon />,
      destinationUrl: '/docs/red-team/quickstart/',
    },
  ];

  return (
    <Box
      sx={{
        maxWidth: 'min(1400px, 95%)',
        mx: 'auto',
        my: { xs: 2, md: 4 },
        pb: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Desktop Tabs */}
      <Stack
        direction="row"
        sx={{
          display: { xs: 'none', md: 'flex' },
          justifyContent: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
          mb: 2,
        }}
      >
        {steps.map((step) => (
          <WalkthroughTab
            key={step.id}
            caption={step.caption}
            isActive={selectedStep === step.id}
            onClick={() => setSelectedStep(step.id)}
          />
        ))}
      </Stack>

      {/* Desktop Content */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Link to={steps.find((step) => step.id === selectedStep)?.destinationUrl || '#'}>
              <ResponsiveImage
                src={steps.find((step) => step.id === selectedStep)?.image || ''}
                src2x={steps.find((step) => step.id === selectedStep)?.image2x}
                srcDark={steps.find((step) => step.id === selectedStep)?.imageDark}
                src2xDark={steps.find((step) => step.id === selectedStep)?.image2xDark}
                alt={`Walkthrough step ${selectedStep}`}
                isDarkTheme={isDarkTheme}
              />
            </Link>
          </Grid>
          <Grid item xs={12} md={4}>
            {steps.find((step) => step.id === selectedStep)?.description}
          </Grid>
        </Grid>
      </Box>

      {/* Mobile Content - Vertical Layout */}
      <Stack
        spacing={3}
        sx={{
          display: { xs: 'flex', md: 'none' },
          pt: 2,
        }}
      >
        {steps.map((step) => (
          <Box key={step.id}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                mb: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                pb: 2,
              }}
            >
              {step.icon}
              <Typography variant="h3" sx={{ fontSize: '1.5rem', fontWeight: 600 }}>
                {step.caption}
              </Typography>
            </Stack>
            <Box sx={{ mb: 3 }}>
              <Link to={step.destinationUrl}>
                <ResponsiveImage
                  src={step.image}
                  src2x={step.image2x}
                  srcDark={step.imageDark}
                  src2xDark={step.image2xDark}
                  alt={step.caption}
                  isDarkTheme={isDarkTheme}
                />
              </Link>
            </Box>
            <Box>{step.description}</Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function AsSeenOnSection() {
  return (
    <section className={styles.asSeenOnSection}>
      <div className="container">
        <h2>Featured In</h2>
        <div className={styles.asSeenOnGrid}>
          <a
            href="https://vimeo.com/1023317525/be082a1029"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.asSeenOnCard}
          >
            <div className={styles.asSeenOnContent}>
              <h3>
                <img
                  src="/img/brands/openai-logo.svg"
                  alt="OpenAI"
                  className={styles.asSeenOnLogoInline}
                />
                Build Hours
              </h3>
              <p>
                "Promptfoo is really powerful because you can iterate on prompts, configure tests in
                YAML, and view everything locally... it's faster and more straightforward"
              </p>
              <span className={styles.watchNow}>Watch the Video →</span>
            </div>
          </a>

          <a
            href="https://github.com/anthropics/courses/tree/master/prompt_evaluations"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.asSeenOnCard}
          >
            <div className={styles.asSeenOnContent}>
              <h3>
                <img
                  src="/img/brands/anthropic-logo.svg"
                  alt="Anthropic"
                  className={styles.asSeenOnLogoInline}
                  style={{ maxWidth: 175 }}
                />
                Courses
              </h3>
              <p>
                "Promptfoo offers a streamlined, out-of-the-box solution that can significantly
                reduce the time and effort required for comprehensive prompt testing."
              </p>
              <span className={styles.watchNow}>See the Course →</span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const [getStartedUrl, setGetStartedUrl] = React.useState('/docs/intro/');

  React.useEffect(() => {
    if (window.location.hash === '#redteam') {
      setGetStartedUrl('/docs/red-team/quickstart/');
    }
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <Layout
        title="Secure & reliable LLMs"
        description="Eliminate risk with AI red-teaming and evals used by 60,000 developers. Find and fix vulnerabilities, maximize output quality, catch regressions."
        wrapperClassName="homepage-wrapper"
      >
        <Head>
          <meta property="og:image" content="https://www.promptfoo.dev/img/meta/homepage.png" />
          <meta name="twitter:card" content="summary_large_image" />
        </Head>
        <HomepageHeader getStartedUrl={getStartedUrl} />
        <HomepageWalkthrough />
        <Box component="main" sx={{ overflowX: 'hidden' }}>
          <Box component="section" className={styles.logoSection}>
            <Container>
              <Typography
                variant="h2"
                sx={{
                  textAlign: 'center',
                  fontSize: { xs: '1.75rem', md: '2rem' },
                  mb: 3,
                }}
              >
                Trusted by developers at
              </Typography>
              <LogoContainer noBackground noBorder />
            </Container>
          </Box>
          <HomepageFeatures />
          <HomepageInfo />
          <AsSeenOnSection />

          <Box className={styles.ctaSection}>
            <Container>
              <Typography
                variant="h2"
                sx={{
                  fontSize: { xs: '1.75rem', md: '2rem' },
                  mb: { xs: 2, md: 3 },
                }}
              >
                Make your LLM app reliable & secure
              </Typography>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                justifyContent="center"
                sx={{ px: { xs: 2, sm: 0 } }}
              >
                <Button
                  component={Link}
                  to={getStartedUrl}
                  variant="contained"
                  size="large"
                  className="button button--primary button--lg"
                >
                  Read Start Guide
                </Button>
                <Button
                  component={Link}
                  to="/contact/"
                  variant="outlined"
                  size="large"
                  className={clsx('button button--secondary button--lg', styles.buttonSecondary)}
                >
                  Contact Us
                </Button>
              </Stack>
            </Container>
          </Box>
          <NewsletterForm />
        </Box>
      </Layout>
    </ThemeProvider>
  );
}
