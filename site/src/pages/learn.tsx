import React from 'react';

import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Layout from '@theme/Layout';
import styles from './card.module.css';

const LearnContent = () => {
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

  const courses = [
    {
      title: 'OpenAI Build Hour: Prompt Testing & Evaluation',
      provider: 'OpenAI',
      date: '2024',
      description:
        'Featured in OpenAI\'s Build Hour series, where they highlight that "Promptfoo is really powerful because you can iterate on prompts, configure tests in YAML, and view everything locally... it\'s faster and more straightforward."',
      duration: '60 Minutes',
      link: 'https://vimeo.com/1023317525',
    },
    {
      title: 'Anthropic Prompt Evaluations Course',
      provider: 'Anthropic',
      date: '2024',
      description:
        'A comprehensive nine-lesson course covering everything from basic evaluations to advanced model-graded techniques. Anthropic notes that "Promptfoo offers a streamlined, out-of-the-box solution that can significantly reduce the time and effort required for comprehensive prompt testing."',
      duration: '6 Hours',
      link: 'https://github.com/anthropics/courses/tree/master/prompt_evaluations',
    },
    {
      title: 'AWS Workshop Studio: Mastering LLM Evaluation',
      provider: 'Amazon Web Services',
      date: '2025',
      description:
        'A comprehensive workshop designed to equip you with the knowledge and practical skills needed to effectively evaluate and improve Large Language Model (LLM) applications using Amazon Bedrock and Promptfoo. The course covers everything from basic setup to advanced evaluation techniques.',
      duration: '3 Hours',
      link: 'https://catalog.us-east-1.prod.workshops.aws/promptfoo/en-US',
    },
    {
      title: 'Move to the Best LLM Model for Your App',
      provider: 'IBM Skills Network',
      date: '2024',
      description:
        'A hands-on guided project that teaches developers how to master model selection using Promptfoo. Learn to adapt to new models, handle pricing changes effectively, and perform regression testing through practical scenarios.',
      duration: '2 Hours',
      link: 'https://cognitiveclass.ai/courses/move-to-the-best-llm-model-for-your-app',
    },
  ];

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg">
        {/* Hero Section */}
        <Box py={8}>
          <Typography variant="h2" component="h1" align="center" gutterBottom fontWeight="bold">
            Learn Promptfoo
          </Typography>
          <Typography variant="h5" component="h2" align="center" color="text.secondary" paragraph>
            Everything you need to build secure, reliable AI applications
          </Typography>
        </Box>

        {/* Getting Started Section */}
        <Box mb={8}>
          <Typography variant="body1" paragraph sx={{ fontSize: '1.1rem', lineHeight: 1.8 }}>
            Learn how to <Link to="/docs/red-team/agents/">red team agents</Link> and{' '}
            <Link to="/docs/guides/evaluate-rag/">evaluate RAG systems</Link>, or get started with{' '}
            <Link to="/docs/getting-started/">evaluations</Link> and{' '}
            <Link to="/docs/red-team/">red teaming</Link>.
          </Typography>
          <Typography variant="body1" paragraph sx={{ fontSize: '1.1rem', lineHeight: 1.8 }}>
            See the complete <Link to="/docs/intro/">documentation</Link> or explore{' '}
            <Link
              href="https://github.com/promptfoo/promptfoo/tree/main/examples"
              target="_blank"
              rel="noopener noreferrer"
            >
              examples on GitHub
            </Link>
            .
          </Typography>
        </Box>

        {/* Courses Section */}
        <Box mb={8}>
          <Typography variant="h4" component="h2" gutterBottom fontWeight="medium" mb={2}>
            Official Courses
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph mb={4}>
            Leading AI platforms have integrated Promptfoo into their official educational
            materials, recognizing it as an essential tool for LLM application development,
            evaluation, and security.
          </Typography>
          <Grid container spacing={4}>
            {courses.map((course) => (
              <Grid size={{ xs: 12, md: 6 }} key={course.link}>
                <Box
                  className={styles.coverageItem}
                  p={3}
                  sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                >
                  <Typography variant="h6" component="h3" gutterBottom>
                    {course.title}
                  </Typography>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {course.provider} • {course.date}
                  </Typography>
                  <Typography variant="body2" paragraph sx={{ flex: 1 }}>
                    {course.description}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 'auto' }}>
                    <Typography variant="caption" color="text.secondary">
                      {course.duration}
                    </Typography>
                    <Link href={course.link} target="_blank" rel="noopener noreferrer">
                      View course →
                    </Link>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Additional Resources Section */}
        <Box mb={8}>
          <Typography variant="h4" component="h2" gutterBottom fontWeight="medium" mb={2}>
            More Resources
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Explore our complete <Link to="/docs/intro">documentation</Link> for in-depth guides,
            tutorials, and API references. Check out{' '}
            <Link
              href="https://github.com/promptfoo/promptfoo/tree/main/examples"
              target="_blank"
              rel="noopener noreferrer"
            >
              examples on GitHub
            </Link>{' '}
            to see Promptfoo in action, or join our{' '}
            <Link href="https://discord.gg/promptfoo" target="_blank" rel="noopener noreferrer">
              Discord community
            </Link>{' '}
            for support.
          </Typography>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

const LearnPage = () => {
  return (
    <Layout
      title="Learn | Promptfoo"
      description="Official courses and educational resources for learning Promptfoo from OpenAI, Anthropic, AWS, and IBM."
    >
      <LearnContent />
    </Layout>
  );
};

export default LearnPage;
