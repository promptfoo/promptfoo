import React from 'react';

import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Layout from '@theme/Layout';
import LogoPanda from '../../../static/img/logo-panda.svg';
import { SITE_CONSTANTS } from '../../constants';
import {
  type Article,
  COMPANY_INFO,
  DEEPSEEK_COVERAGE,
  EDUCATIONAL_RESOURCES,
  type EducationalResource,
  FEATURED_PODCASTS,
  FOUNDERS,
  type Podcast,
  TECHNICAL_CONTENT,
  type TechnicalContent,
} from './_data';
import styles from './styles.module.css';

const ArticleLink = ({ article }: { article: Article }) => (
  <Grid size={{ xs: 12, md: 6 }} key={article.link}>
    <Link href={article.link} className={styles.articleLink}>
      <Typography variant="subtitle2" color="text.secondary" component="span">
        {article.publication}
      </Typography>
      <Typography variant="body2">{article.title}</Typography>
    </Link>
  </Grid>
);

const getPodcastLinkText = (link: string): string => {
  try {
    const hostname = new URL(link).hostname;
    if (hostname === 'spotify.com' || hostname === 'open.spotify.com') {
      return 'Listen on Spotify →';
    }
    if (hostname === 'youtube.com' || hostname === 'www.youtube.com' || hostname === 'youtu.be') {
      return 'Watch on YouTube →';
    }
  } catch {
    // Invalid URL, use default text
  }
  return 'Listen to episode →';
};

const PodcastCard = ({ podcast }: { podcast: Podcast }) => (
  <Grid size={{ xs: 12, md: 6 }}>
    <Box
      className={styles.coverageItem}
      p={3}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Typography variant="h6" component="h4" gutterBottom>
        {podcast.title}
      </Typography>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        {podcast.source} &bull; {podcast.date}
      </Typography>
      <Typography variant="body2" paragraph sx={{ flex: 1 }}>
        {podcast.description}
      </Typography>
      <Link href={podcast.link} target="_blank" rel="noopener noreferrer">
        {getPodcastLinkText(podcast.link)}
      </Link>
    </Box>
  </Grid>
);

const EducationalResourceCard = ({ resource }: { resource: EducationalResource }) => (
  <Grid size={{ xs: 12, md: 6 }}>
    <Box
      className={styles.coverageItem}
      p={3}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Typography variant="h6" component="h4" gutterBottom>
        {resource.title}
      </Typography>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        {resource.source} &bull; {resource.year}
      </Typography>
      <Typography variant="body2" paragraph sx={{ flex: 1 }}>
        {resource.description}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 'auto' }}>
        <Typography variant="caption" color="text.secondary">
          {resource.duration}
        </Typography>
        <Link href={resource.link}>View course →</Link>
      </Box>
    </Box>
  </Grid>
);

const TechnicalContentCard = ({ content }: { content: TechnicalContent }) => (
  <Grid size={{ xs: 12, md: 6 }}>
    <Box
      className={styles.coverageItem}
      p={3}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Typography variant="h6" component="h4" gutterBottom>
        {content.title}
      </Typography>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        {content.source} &bull; {content.date}
      </Typography>
      <Typography variant="body2" paragraph sx={{ flex: 1 }}>
        {content.description}
      </Typography>
      <Link href={content.link}>Read article →</Link>
    </Box>
  </Grid>
);

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
          <Typography
            variant="h4"
            component="h3"
            id="about-promptfoo"
            gutterBottom
            fontWeight="medium"
          >
            About Promptfoo
          </Typography>
          <Typography variant="body1" paragraph>
            Promptfoo is a leading provider of AI security solutions, helping developers and
            enterprises build secure, reliable AI applications. Based in {COMPANY_INFO.headquarters}
            , Promptfoo is backed by {COMPANY_INFO.investors}.
          </Typography>
          <Typography variant="body1" paragraph>
            Our core product is an open-source pentesting and evaluation framework used by{' '}
            {SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers. Promptfoo is among the most popular
            evaluation frameworks and is the first product to adapt AI-specific pentesting
            techniques to your application.
          </Typography>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Featured Podcasts Section */}
        <Box mb={8}>
          <Typography
            variant="h4"
            component="h3"
            id="featured-podcasts"
            gutterBottom
            fontWeight="medium"
          >
            Podcast Appearances
          </Typography>
          <Grid container spacing={4}>
            {FEATURED_PODCASTS.map((podcast) => (
              <PodcastCard key={podcast.link} podcast={podcast} />
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Press Coverage Section */}
        <Box mb={8}>
          <Typography
            variant="h4"
            component="h3"
            id="recent-coverage"
            gutterBottom
            fontWeight="medium"
          >
            Press Coverage
          </Typography>

          {/* DeepSeek Research Coverage */}
          <Grid container spacing={4} mb={6}>
            <Grid size={12}>
              <Box className={styles.coverageItem} p={3}>
                <Typography variant="h6" component="h4" gutterBottom>
                  DeepSeek AI Censorship Research
                </Typography>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  January 2025
                </Typography>
                <Typography variant="body1" paragraph>
                  Our groundbreaking research on AI censorship and content filtering in DeepSeek
                  models has been widely covered by major technology and news publications.
                </Typography>
                <Typography variant="body2" paragraph>
                  <Link to="/blog/deepseek-censorship/">Read the original research →</Link>
                </Typography>
                <Grid container spacing={2} mt={2}>
                  {DEEPSEEK_COVERAGE.map((article) => (
                    <ArticleLink key={article.link} article={article} />
                  ))}
                </Grid>
              </Box>
            </Grid>
          </Grid>

          {/* Educational Resources Section */}
          <Typography variant="h5" component="h4" id="educational-resources" gutterBottom mt={6}>
            Educational Resources
          </Typography>
          <Typography variant="body1" paragraph>
            Leading AI platforms have integrated Promptfoo into their official educational
            materials, recognizing it as an essential tool for LLM application development,
            evaluation, and security. These courses and workshops, developed in partnership with
            industry leaders, provide comprehensive training on building reliable AI applications.
          </Typography>
          <Grid container spacing={4} mb={6}>
            {EDUCATIONAL_RESOURCES.map((resource) => (
              <EducationalResourceCard key={resource.link} resource={resource} />
            ))}
          </Grid>

          {/* Technical Content Section */}
          <Typography variant="h5" component="h4" id="technical-content-guides" gutterBottom mt={6}>
            Technical Content & Guides
          </Typography>
          <Grid container spacing={4} mb={6}>
            {TECHNICAL_CONTENT.map((content) => (
              <TechnicalContentCard key={content.link} content={content} />
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Brand Assets Section */}
        <Box mb={8}>
          <Typography
            variant="h4"
            component="h3"
            id="brand-assets"
            gutterBottom
            fontWeight="medium"
          >
            Brand Assets
          </Typography>
          <Typography variant="body1" paragraph>
            Download official Promptfoo logos and brand assets for media use.
          </Typography>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
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
          <Typography
            variant="h4"
            component="h3"
            id="media-contact"
            gutterBottom
            fontWeight="medium"
          >
            Media Contact
          </Typography>
          <Typography variant="body1" paragraph>
            For press inquiries, please contact our media relations team:
          </Typography>
          <Typography variant="body1" paragraph>
            <Link href={`mailto:${COMPANY_INFO.contactEmail}`}>{COMPANY_INFO.contactEmail}</Link>
          </Typography>
          <Typography variant="body1" paragraph>
            For urgent inquiries, please include "URGENT" in the subject line.
          </Typography>
        </Box>

        {/* Company Facts Section */}
        <Box mb={8}>
          <Typography variant="h4" component="h3" id="quick-facts" gutterBottom fontWeight="medium">
            Quick Facts
          </Typography>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" component="h4" gutterBottom>
                Founded
              </Typography>
              <Typography variant="body1" paragraph>
                {COMPANY_INFO.founded}
              </Typography>
              <Typography variant="h6" component="h4" gutterBottom>
                Headquarters
              </Typography>
              <Typography variant="body1" paragraph>
                {COMPANY_INFO.headquarters}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" component="h4" gutterBottom>
                Leadership
              </Typography>
              <Typography variant="body1" paragraph>
                {FOUNDERS.map((founder, index) => (
                  <React.Fragment key={founder.name}>
                    <Link href={founder.linkedIn} target="_blank" rel="noopener noreferrer">
                      {founder.name}
                    </Link>
                    , {founder.title}
                    {index < FOUNDERS.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </Typography>
              <Typography variant="h6" component="h4" gutterBottom>
                Investors
              </Typography>
              <Typography variant="body1" paragraph>
                {COMPANY_INFO.investors}
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

const PressPage = () => {
  const { siteConfig } = useDocusaurusContext();
  const siteUrl = siteConfig.url;

  return (
    <Layout
      title="Press | Promptfoo"
      description="Press resources and media information for Promptfoo - Leading the future of AI security testing."
    >
      <Head>
        <meta property="og:title" content="Press Center - Promptfoo" />
        <meta
          property="og:description"
          content="Press resources and media information for Promptfoo - Leading the future of AI security testing."
        />
        <meta property="og:image" content={`${siteUrl}/img/og/press-og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${siteUrl}/press`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Press Center - Promptfoo" />
        <meta
          name="twitter:description"
          content="Press resources and media information for Promptfoo - Leading the future of AI security testing."
        />
        <meta name="twitter:image" content={`${siteUrl}/img/og/press-og.png`} />
        <link rel="canonical" href={`${siteUrl}/press`} />
      </Head>
      <PressContent />
    </Layout>
  );
};

export default PressPage;
