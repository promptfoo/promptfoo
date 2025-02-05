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
            enterprises build secure, reliable AI applications. Based in San Francisco, California,
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

          {/* Featured Research */}
          <Grid container spacing={4} mb={6}>
            <Grid item xs={12}>
              <Box className={styles.coverageItem} p={3}>
                <Typography variant="h6" component="h4" gutterBottom>
                  DeepSeek AI Censorship Research
                </Typography>
                <Typography variant="body1" paragraph>
                  Our groundbreaking research on AI censorship and content filtering in DeepSeek
                  models has been widely covered by major technology and news publications.
                </Typography>
                <Typography variant="body2" paragraph>
                  <Link to="/blog/deepseek-censorship/">Read the original research →</Link>
                </Typography>
                <Grid container spacing={2} mt={2}>
                  {[
                    {
                      publication: 'Ars Technica',
                      title:
                        "The questions the Chinese government doesn't want DeepSeek AI to answer",
                      link: 'https://arstechnica.com/ai/2025/01/the-questions-the-chinese-government-doesnt-want-deepseek-ai-to-answer/',
                    },
                    {
                      publication: 'TechCrunch',
                      title:
                        "DeepSeek's AI avoids answering 85% of prompts on sensitive topics related to China",
                      link: 'https://techcrunch.com/2025/01/29/deepseeks-ai-avoids-answering-85-of-prompts-on-sensitive-topics-related-to-china/',
                    },
                    {
                      publication: 'CyberNews',
                      title: 'DeepSeek China censorship prompts output AI',
                      link: 'https://cybernews.com/news/deepseek-china-censorship-promps-output-ai/',
                    },
                    {
                      publication: 'Gizmodo',
                      title: 'The Knives Are Coming Out For DeepSeek AI',
                      link: 'http://gizmodo.com/the-knives-are-coming-out-for-deepseek-ai-2000556375',
                    },
                    {
                      publication: 'The Independent',
                      title: 'DeepSeek AI China censorship Tiananmen Square',
                      link: 'https://www.the-independent.com/tech/deepseek-ai-china-censorship-tiananmen-square-b2688390.html',
                    },
                    {
                      publication: 'Washington Times',
                      title: 'Inside Ring: DeepSeek toes Chinese party line',
                      link: 'https://www.washingtontimes.com/news/2025/jan/29/inside-ring-deepseek-toes-chinese-party-line-xi-ta/',
                    },
                    {
                      publication: 'Yahoo Finance',
                      title: 'DeepSeek Users Forcing AI to Reveal Censorship',
                      link: 'https://finance.yahoo.com/news/deepseek-users-forcing-ai-reveal-151950834.html',
                    },
                    {
                      publication: 'MSN',
                      title: 'DeepSeek AI censors most prompts on sensitive topics for China',
                      link: 'https://www.msn.com/en-us/news/technology/deepseek-ai-censors-most-prompts-on-sensitive-topics-for-china/ar-AA1ycVkf',
                    },
                    {
                      publication: 'Hacker News',
                      title: 'Discussion: DeepSeek Censorship Research',
                      link: 'https://news.ycombinator.com/item?id=42858552',
                    },
                  ].map((article) => (
                    <Grid item xs={12} md={6} key={article.link}>
                      <Link href={article.link} className={styles.articleLink}>
                        <Typography variant="subtitle2" color="text.secondary" component="span">
                          {article.publication}
                        </Typography>
                        <Typography variant="body2">{article.title}</Typography>
                      </Link>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            </Grid>
          </Grid>

          {/* Featured Podcasts */}
          <Typography variant="h5" component="h4" gutterBottom mt={6}>
            Featured Podcasts
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Box className={styles.coverageItem} p={3}>
                <Typography variant="h6" component="h4" gutterBottom>
                  Securing AI by Democratizing Red Teams
                </Typography>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  a16z Podcast • August 2, 2024
                </Typography>
                <Typography variant="body2" paragraph>
                  a16z General Partner Anjney Midha speaks with Promptfoo founder and CEO Ian
                  Webster about the importance of red-teaming for AI safety and security, and how
                  bringing those capabilities to more organizations will lead to safer, more
                  predictable generative AI applications.
                </Typography>
                <Link href="https://a16z.com/podcast/securing-ai-by-democratizing-red-teams/">
                  Listen to episode →
                </Link>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box className={styles.coverageItem} p={3}>
                <Typography variant="h6" component="h4" gutterBottom>
                  The Future of AI Security
                </Typography>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  CyberBytes with Steffen Foley • 2024
                </Typography>
                <Typography variant="body2" paragraph>
                  A deep dive into Ian's evolution from shipping Gen AI products as an engineer to
                  launching a cybersecurity company, the fascinating origin of Promptfoo, and key
                  insights on the latest AI security trends.
                </Typography>
                <Link href="https://open.spotify.com/episode/6bdzElwFgZoBHjRrYyqHoN">
                  Listen on Spotify →
                </Link>
              </Box>
            </Grid>
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
                <LogoPanda style={{ maxWidth: '200px', height: 'auto' }} />
                <Typography variant="subtitle1" mt={2}>
                  Promptfoo Logo (SVG)
                </Typography>
                <a href="/img/logo-panda.svg" download>
                  Download
                </a>
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
            <Link href="mailto:inquiries@promptfoo.dev">inquiries@promptfoo.dev</Link>
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
                2024
              </Typography>
              <Typography variant="h6" component="h4" gutterBottom>
                Headquarters
              </Typography>
              <Typography variant="body1" paragraph>
                San Francisco, California
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" component="h4" gutterBottom>
                Leadership
              </Typography>
              <Typography variant="body1" paragraph>
                <Link
                  href="https://www.linkedin.com/in/ianww/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ian Webster
                </Link>
                , CEO & Co-founder
                <br />
                <Link
                  href="https://www.linkedin.com/in/michaelldangelo/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Michael D'Angelo
                </Link>
                , CTO & Co-founder
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
