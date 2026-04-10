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

const SectionHeading = ({ id, children }: { id: string; children: string }) => (
  <Typography
    variant="h4"
    component="h3"
    gutterBottom
    className={styles.sectionHeading}
    sx={{
      fontWeight: 'medium',
    }}
  >
    {children}
    <a href={`#${id}`} className={styles.anchorLink} aria-label={`Link to ${children}`}>
      #
    </a>
  </Typography>
);

const ArticleLink = ({ article }: { article: Article }) => (
  <Grid size={{ xs: 12, md: 6 }} key={article.link}>
    <Link href={article.link} className={styles.articleLink}>
      <Typography
        variant="subtitle2"
        component="span"
        sx={{
          color: 'text.secondary',
        }}
      >
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
      sx={{
        p: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography variant="h6" component="h4" gutterBottom>
        {podcast.title}
      </Typography>
      <Typography
        variant="subtitle2"
        gutterBottom
        sx={{
          color: 'text.secondary',
        }}
      >
        {podcast.source} &bull; {podcast.date}
      </Typography>
      <Typography variant="body2" component="p" sx={{ flex: 1, mb: 2 }}>
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
      sx={{
        p: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography variant="h6" component="h4" gutterBottom>
        {resource.title}
      </Typography>
      <Typography
        variant="subtitle2"
        gutterBottom
        sx={{
          color: 'text.secondary',
        }}
      >
        {resource.source} &bull; {resource.year}
      </Typography>
      <Typography variant="body2" component="p" sx={{ flex: 1, mb: 2 }}>
        {resource.description}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 'auto' }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
          }}
        >
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
      sx={{
        p: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography variant="h6" component="h4" gutterBottom>
        {content.title}
      </Typography>
      <Typography
        variant="subtitle2"
        gutterBottom
        sx={{
          color: 'text.secondary',
        }}
      >
        {content.source} &bull; {content.date}
      </Typography>
      <Typography variant="body2" component="p" sx={{ flex: 1, mb: 2 }}>
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
        typography: {
          fontFamily: 'var(--ifm-font-family-base)',
        },
      }),
    [colorMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg">
        <Box
          sx={{
            py: 8,
          }}
        >
          <Typography
            variant="h2"
            component="h1"
            align="center"
            gutterBottom
            sx={{
              fontWeight: 'bold',
            }}
          >
            Press Center
          </Typography>
          <Typography
            variant="h5"
            component="h2"
            align="center"
            sx={{
              color: 'text.secondary',
              mb: 2,
            }}
          >
            Resources and information for media coverage of Promptfoo
          </Typography>
        </Box>

        {/* Company Overview Section */}
        <Box
          id="about-promptfoo"
          className={styles.section}
          sx={{
            mb: 8,
          }}
        >
          <SectionHeading id="about-promptfoo">About Promptfoo</SectionHeading>
          <Typography variant="body1" component="p" sx={{ mb: 2 }}>
            Promptfoo is a leading provider of AI security solutions, helping developers and
            enterprises build secure, reliable AI applications. Based in {COMPANY_INFO.headquarters}
            , Promptfoo is now part of OpenAI and continues as an open-source AI security project.
          </Typography>
          <Typography variant="body1" component="p" sx={{ mb: 2 }}>
            Our core product is an open-source pentesting and evaluation framework used by{' '}
            {SITE_CONSTANTS.USER_COUNT_DISPLAY}+ developers. Promptfoo is among the most popular
            evaluation frameworks and is the first product to adapt AI-specific pentesting
            techniques to your application.
          </Typography>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Featured Podcasts Section */}
        <Box
          id="featured-podcasts"
          className={styles.section}
          sx={{
            mb: 8,
          }}
        >
          <SectionHeading id="featured-podcasts">Podcast Appearances</SectionHeading>
          <Grid container spacing={4}>
            {FEATURED_PODCASTS.map((podcast) => (
              <PodcastCard key={podcast.link} podcast={podcast} />
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Press Coverage Section */}
        <Box
          id="recent-coverage"
          className={styles.section}
          sx={{
            mb: 8,
          }}
        >
          <SectionHeading id="recent-coverage">Press Coverage</SectionHeading>

          {/* DeepSeek Research Coverage */}
          <Grid
            container
            spacing={4}
            sx={{
              mb: 6,
            }}
          >
            <Grid size={12}>
              <Box
                className={styles.coverageItem}
                sx={{
                  p: 3,
                }}
              >
                <Typography variant="h6" component="h4" gutterBottom>
                  DeepSeek AI Censorship Research
                </Typography>
                <Typography
                  variant="subtitle2"
                  gutterBottom
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  January 2025
                </Typography>
                <Typography variant="body1" component="p" sx={{ mb: 2 }}>
                  Our groundbreaking research on AI censorship and content filtering in DeepSeek
                  models has been widely covered by major technology and news publications.
                </Typography>
                <Typography variant="body2" component="p" sx={{ mb: 2 }}>
                  <Link to="/blog/deepseek-censorship/">Read the original research →</Link>
                </Typography>
                <Grid
                  container
                  spacing={2}
                  sx={{
                    mt: 2,
                  }}
                >
                  {DEEPSEEK_COVERAGE.map((article) => (
                    <ArticleLink key={article.link} article={article} />
                  ))}
                </Grid>
              </Box>
            </Grid>
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Educational Resources Section */}
        <Box
          id="educational-resources"
          className={styles.section}
          sx={{
            mb: 8,
          }}
        >
          <SectionHeading id="educational-resources">Educational Resources</SectionHeading>
          <Typography variant="body1" component="p" sx={{ mb: 2 }}>
            Leading AI platforms have integrated Promptfoo into their official educational
            materials, recognizing it as an essential tool for LLM application development,
            evaluation, and security. These courses and workshops, developed in partnership with
            industry leaders, provide comprehensive training on building reliable AI applications.
          </Typography>
          <Grid container spacing={4}>
            {EDUCATIONAL_RESOURCES.map((resource) => (
              <EducationalResourceCard key={resource.link} resource={resource} />
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Technical Content Section */}
        <Box
          id="technical-content"
          className={styles.section}
          sx={{
            mb: 8,
          }}
        >
          <SectionHeading id="technical-content">Technical Content & Guides</SectionHeading>
          <Grid container spacing={4}>
            {TECHNICAL_CONTENT.map((content) => (
              <TechnicalContentCard key={content.link} content={content} />
            ))}
          </Grid>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Brand Assets Section */}
        <Box
          id="brand-assets"
          className={styles.section}
          sx={{
            mb: 8,
          }}
        >
          <SectionHeading id="brand-assets">Brand Assets</SectionHeading>
          <Typography variant="body1" component="p" sx={{ mb: 2 }}>
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
                <Typography
                  variant="subtitle1"
                  sx={{
                    mt: 2,
                  }}
                >
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
        <Box
          id="media-contact"
          className={styles.section}
          sx={{
            mb: 8,
          }}
        >
          <SectionHeading id="media-contact">Media Contact</SectionHeading>
          <Typography variant="body1" component="p" sx={{ mb: 2 }}>
            For press inquiries, please contact our media relations team:
          </Typography>
          <Typography variant="body1" component="p" sx={{ mb: 2 }}>
            <Link href={`mailto:${COMPANY_INFO.contactEmail}`}>{COMPANY_INFO.contactEmail}</Link>
          </Typography>
          <Typography variant="body1" component="p" sx={{ mb: 2 }}>
            For urgent inquiries, please include "URGENT" in the subject line.
          </Typography>
        </Box>

        <Divider sx={{ my: 8 }} />

        {/* Company Facts Section */}
        <Box
          id="quick-facts"
          className={styles.section}
          sx={{
            mb: 8,
          }}
        >
          <SectionHeading id="quick-facts">Quick Facts</SectionHeading>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" component="h4" gutterBottom>
                Founded
              </Typography>
              <Typography variant="body1" component="p" sx={{ mb: 2 }}>
                {COMPANY_INFO.founded}
              </Typography>
              <Typography variant="h6" component="h4" gutterBottom>
                Headquarters
              </Typography>
              <Typography variant="body1" component="p" sx={{ mb: 2 }}>
                {COMPANY_INFO.headquarters}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" component="h4" gutterBottom>
                Leadership
              </Typography>
              <Typography variant="body1" component="p" sx={{ mb: 2 }}>
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
                Part of
              </Typography>
              <Typography variant="body1" component="p" sx={{ mb: 2 }}>
                {COMPANY_INFO.affiliation}
              </Typography>
              <Typography variant="h6" component="h4" gutterBottom>
                Early supporters
              </Typography>
              <Typography variant="body1" component="p" sx={{ mb: 2 }}>
                {COMPANY_INFO.earlySupporters}
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
