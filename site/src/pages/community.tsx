import React from 'react';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import Layout from '@theme/Layout';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SchoolIcon from '@mui/icons-material/School';
import ScienceIcon from '@mui/icons-material/Science';
import ArticleIcon from '@mui/icons-material/Article';
import PodcastsIcon from '@mui/icons-material/Podcasts';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import GroupsIcon from '@mui/icons-material/Groups';
import BusinessIcon from '@mui/icons-material/Business';
import SecurityIcon from '@mui/icons-material/Security';
import CodeIcon from '@mui/icons-material/Code';
import StarIcon from '@mui/icons-material/Star';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShieldIcon from '@mui/icons-material/Shield';
import BugReportIcon from '@mui/icons-material/BugReport';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SpeedIcon from '@mui/icons-material/Speed';
import styles from './community.module.css';

const CommunityContent = () => {
  const { colorMode } = useColorMode();
  const [expandedSection, setExpandedSection] = React.useState<string | false>(false);
  
  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: colorMode === 'dark' ? 'dark' : 'light',
          primary: {
            main: colorMode === 'dark' ? '#3b82f6' : '#2563eb',
          },
          secondary: {
            main: '#10b981',
          },
          warning: {
            main: '#f59e0b',
          },
          error: {
            main: '#ef4444',
          },
        },
      }),
    [colorMode]
  );

  const handleAccordionChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedSection(isExpanded ? panel : false);
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ flexGrow: 1, py: 0 }}>
        {/* Hero Section - Red Teaming Focus */}
        <Box 
          sx={{ 
            background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
            color: 'white',
            pt: 8,
            pb: 10,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Container maxWidth="lg">
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={8}>
                <Typography 
                  variant="h1" 
                  sx={{ 
                    fontSize: { xs: '2.5rem', md: '3.5rem' }, 
                    fontWeight: 800,
                    mb: 3,
                    lineHeight: 1.2,
                  }}
                >
                  The AI Red Teaming Platform<br />
                  <span style={{ fontSize: '0.85em', opacity: 0.95 }}>
                    Trusted by Security Leaders
                  </span>
                </Typography>
                
                <Typography 
                  variant="h5" 
                  sx={{ 
                    mb: 4, 
                    opacity: 0.95,
                    fontWeight: 400,
                    lineHeight: 1.6,
                  }}
                >
                  The only platform that combines dynamic red teaming with quality evaluation. 
                  Find vulnerabilities before attackers do. Ensure quality before users complain.
                </Typography>

                {/* Conference Badge */}
                <Box sx={{ mb: 3 }}>
                  <Chip 
                    icon={<ShieldIcon />}
                    label="Speaking at Black Hat USA 2025 AI Summit" 
                    sx={{ 
                      fontSize: '1rem', 
                      py: 1.5,
                      px: 2,
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      borderColor: 'white',
                    }}
                    variant="outlined"
                    component="a"
                    href="https://www.blackhat.com/us-25/ai-summit.html"
                    target="_blank"
                    clickable
                  />
                </Box>

                {/* Dual CTAs */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 4 }}>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<ShieldIcon />}
                    sx={{
                      backgroundColor: 'white',
                      color: '#dc2626',
                      px: 4,
                      py: 1.5,
                      fontSize: '1.1rem',
                      fontWeight: 600,
                      '&:hover': {
                        backgroundColor: '#f3f4f6',
                      },
                    }}
                    href="/docs/red-team/"
                  >
                    Red Team My AI
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={<AssessmentIcon />}
                    sx={{
                      borderColor: 'white',
                      color: 'white',
                      px: 4,
                      py: 1.5,
                      fontSize: '1.1rem',
                      fontWeight: 600,
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderColor: 'white',
                      },
                    }}
                    href="/docs/getting-started/"
                  >
                    Evaluate Quality
                  </Button>
                </Stack>

                {/* Key Stats */}
                <Grid container spacing={3}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>100K+</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>Developers</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>5K+</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>GitHub Stars</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>21+</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>Papers Cite Us</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>96%</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>Attack Detection</Typography>
                  </Grid>
                </Grid>
              </Grid>

              <Grid item xs={12} md={4}>
                <Box sx={{ position: 'relative', height: '100%', minHeight: 300 }}>
                  <Box
                    sx={{
                      position: 'absolute',
                      right: -50,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      opacity: 0.1,
                    }}
                  >
                    <ShieldIcon sx={{ fontSize: 400 }} />
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Mainstream Validation Bar */}
        <Box sx={{ bgcolor: 'background.paper', py: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Container maxWidth="lg">
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={4}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    FEATURED IN:
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    TechCrunch
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    "Andreessen Horowitz-backed"
                  </Typography>
                </Stack>
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                  <FormatQuoteIcon sx={{ fontSize: 16, mr: 1, opacity: 0.6 }} />
                  DeepSeek's AI avoids answering 85% of sensitive prompts... according to Promptfoo's research
                  <Link 
                    href="https://techcrunch.com/2025/01/29/deepseeks-ai-avoids-answering-85-of-prompts-on-sensitive-topics-related-to-china/"
                    target="_blank"
                    style={{ marginLeft: 8 }}
                  >
                    Read on TechCrunch →
                  </Link>
                </Typography>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Security vs Quality Paths */}
        <Container maxWidth="lg" sx={{ mt: -6, position: 'relative', zIndex: 10 }}>
          <Grid container spacing={3}>
            {/* Security Path */}
            <Grid item xs={12} md={6}>
              <Card 
                elevation={8}
                sx={{ 
                  height: '100%',
                  border: '2px solid',
                  borderColor: theme.palette.error.main,
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                  },
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                    <ShieldIcon sx={{ fontSize: 40, color: theme.palette.error.main }} />
                    <Typography variant="h4" sx={{ fontWeight: 700, color: theme.palette.error.main }}>
                      For Security Teams
                    </Typography>
                  </Stack>
                  
                  <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                    Enterprise-Grade AI Red Teaming
                  </Typography>
                  
                  <Stack spacing={2} sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <BugReportIcon sx={{ mr: 1, mt: 0.5, color: theme.palette.error.main }} />
                      <Typography>Dynamic prompt injection & jailbreak attacks</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <SecurityIcon sx={{ mr: 1, mt: 0.5, color: theme.palette.error.main }} />
                      <Typography>PII leakage and data exfiltration detection</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <BusinessIcon sx={{ mr: 1, mt: 0.5, color: theme.palette.error.main }} />
                      <Typography>OWASP LLM Top 10 compliance testing</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <SpeedIcon sx={{ mr: 1, mt: 0.5, color: theme.palette.error.main }} />
                      <Typography>Continuous security monitoring in CI/CD</Typography>
                    </Box>
                  </Stack>

                  <Stack spacing={2}>
                    <Button
                      variant="contained"
                      fullWidth
                      size="large"
                      sx={{
                        backgroundColor: theme.palette.error.main,
                        '&:hover': {
                          backgroundColor: theme.palette.error.dark,
                        },
                      }}
                      href="/contact/"
                    >
                      Start Enterprise Security Assessment
                    </Button>
                    <Button
                      variant="outlined"
                      fullWidth
                      sx={{
                        borderColor: theme.palette.error.main,
                        color: theme.palette.error.main,
                      }}
                      href="/docs/red-team/"
                    >
                      Try Free Red Team Scan
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Quality Path */}
            <Grid item xs={12} md={6}>
              <Card 
                elevation={8}
                sx={{ 
                  height: '100%',
                  border: '2px solid',
                  borderColor: theme.palette.primary.main,
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                  },
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                    <AssessmentIcon sx={{ fontSize: 40, color: theme.palette.primary.main }} />
                    <Typography variant="h4" sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
                      For Engineering Teams
                    </Typography>
                  </Stack>
                  
                  <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                    Comprehensive AI Quality Testing
                  </Typography>
                  
                  <Stack spacing={2} sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <CodeIcon sx={{ mr: 1, mt: 0.5, color: theme.palette.primary.main }} />
                      <Typography>Automated accuracy and hallucination testing</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <TrendingUpIcon sx={{ mr: 1, mt: 0.5, color: theme.palette.primary.main }} />
                      <Typography>A/B testing for prompts and models</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <SpeedIcon sx={{ mr: 1, mt: 0.5, color: theme.palette.primary.main }} />
                      <Typography>Performance benchmarking and cost analysis</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                      <BusinessIcon sx={{ mr: 1, mt: 0.5, color: theme.palette.primary.main }} />
                      <Typography>RAG evaluation and retrieval optimization</Typography>
                    </Box>
                  </Stack>

                  <Stack spacing={2}>
                    <Button
                      variant="contained"
                      fullWidth
                      size="large"
                      href="/docs/getting-started/"
                    >
                      Start Testing in 5 Minutes
                    </Button>
                    <Button
                      variant="outlined"
                      fullWidth
                      href="https://github.com/promptfoo/promptfoo"
                      target="_blank"
                    >
                      View on GitHub
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>

        {/* Enterprise Adoption Section */}
        <Container maxWidth="lg" sx={{ mt: 8, mb: 6 }}>
          <Typography 
            variant="h3" 
            sx={{ 
              textAlign: 'center',
              mb: 6,
              fontWeight: 700,
            }}
          >
            Trusted by Leading Security & Engineering Teams
          </Typography>

          <Grid container spacing={4}>
            {/* Security Success Stories */}
            <Grid item xs={12}>
              <Typography 
                variant="h5" 
                sx={{ 
                  mb: 3,
                  color: theme.palette.error.main,
                  fontWeight: 600,
                }}
              >
                <ShieldIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Security Success Stories
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', borderTop: `4px solid ${theme.palette.error.main}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <img 
                      src="/img/logos/semgrep.svg" 
                      alt="Semgrep" 
                      style={{ height: 40, marginRight: 16 }}
                    />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      96% Attack Detection Rate
                    </Typography>
                  </Box>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    "Promptfoo identified vulnerabilities in our AI assistant with 96% accuracy, 
                    dramatically improving our security posture."
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Link 
                      href="https://semgrep.dev/blog/2025/building-an-appsec-ai-that-security-researchers-agree-with-96-of-the-time"
                      target="_blank"
                    >
                      Read Full Case Study →
                    </Link>
                    <Link 
                      href="https://semgrep.dev/blog/2024/promptfoo-guard-llm-security" 
                      target="_blank"
                      style={{ fontSize: '0.875rem' }}
                    >
                      Original Post
                    </Link>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', borderTop: `4px solid ${theme.palette.error.main}` }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    Red Teaming Comparison Winner
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    Independent analysis shows Promptfoo outperforms other red teaming tools 
                    in coverage, accuracy, and ease of use.
                  </Typography>
                  <Link 
                    href="https://www.builder.io/blog/llm-red-teaming-tools-compared"
                    target="_blank"
                  >
                    See the Comparison →
                  </Link>
                </CardContent>
              </Card>
            </Grid>

            {/* Engineering Success Stories */}
            <Grid item xs={12}>
              <Typography 
                variant="h5" 
                sx={{ 
                  mb: 3,
                  mt: 4,
                  color: theme.palette.primary.main,
                  fontWeight: 600,
                }}
              >
                <AssessmentIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Engineering Success Stories
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%', borderTop: `4px solid ${theme.palette.primary.main}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <img 
                      src="/img/logos/doordash.png" 
                      alt="DoorDash" 
                      style={{ height: 30, marginRight: 16 }}
                    />
                    <Typography variant="h6">DoorDash</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    "Using Promptfoo to evaluate our production RAG chatbot for accuracy and hallucinations."
                  </Typography>
                  <Link 
                    href="https://doordash.engineering/2024/08/22/how-doordash-built-an-ensemble-learning-model-for-time-series-forecasting/"
                    target="_blank"
                  >
                    Engineering Blog →
                  </Link>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%', borderTop: `4px solid ${theme.palette.primary.main}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <img 
                      src="/img/logos/shopify.svg" 
                      alt="Shopify" 
                      style={{ height: 30, marginRight: 16 }}
                    />
                    <Typography variant="h6">Shopify</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    "Promptfoo helps us systematically test Sidekick's responses across different scenarios."
                  </Typography>
                  <Link 
                    href="https://shopify.engineering/building-shopify-sidekick-commerce-ai-assistant"
                    target="_blank"
                  >
                    Read More →
                  </Link>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%', borderTop: `4px solid ${theme.palette.primary.main}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">Google Cloud</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Official integration with Vertex AI for comprehensive model evaluation.
                  </Typography>
                  <Link 
                    href="https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview"
                    target="_blank"
                  >
                    Vertex AI Docs →
                  </Link>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Platform Integrations */}
          <Box sx={{ mt: 6, textAlign: 'center' }}>
            <Typography variant="h6" sx={{ mb: 3, opacity: 0.8 }}>
              Official Integrations & Endorsements
            </Typography>
            <Stack 
              direction="row" 
              spacing={3} 
              sx={{ 
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: 3,
              }}
            >
              <Chip 
                label="AWS Bedrock Prompt Flows" 
                sx={{ fontSize: '1rem', py: 2, px: 1 }}
                component="a"
                href="https://aws.amazon.com/blogs/machine-learning/evaluating-prompts-at-scale-with-prompt-management-and-prompt-flows-for-amazon-bedrock/"
                target="_blank"
                clickable
              />
              <Chip 
                label="Google Vertex AI" 
                sx={{ fontSize: '1rem', py: 2, px: 1 }}
                component="a"
                href="https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview"
                target="_blank"
                clickable
              />
              <Chip 
                label="Microsoft Azure" 
                sx={{ fontSize: '1rem', py: 2, px: 1 }}
                component="a"
                href="https://microsoft.github.io/genaiscript/reference/scripts/tests/#using-promptfoo"
                target="_blank"
                clickable
              />
              <Chip 
                label="Langfuse" 
                sx={{ fontSize: '1rem', py: 2, px: 1 }}
                component="a"
                href="https://langfuse.com/docs/integrations/promptfoo"
                target="_blank"
                clickable
              />
              <Chip 
                label="Portkey AI" 
                sx={{ fontSize: '1rem', py: 2, px: 1 }}
                component="a"
                href="https://portkey.ai/blog/implementing-evals-as-a-core-part-of-ai-development"
                target="_blank"
                clickable
              />
            </Stack>

            {/* Conference Badges */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="body2" sx={{ mb: 2, opacity: 0.6, textAlign: 'center' }}>
                FEATURED AT
              </Typography>
              <Stack 
                direction="row" 
                spacing={2} 
                sx={{ 
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: 2,
                }}
              >
                <Chip 
                  icon={<ShieldIcon />}
                  label="Black Hat USA 2025" 
                  sx={{ 
                    fontSize: '0.9rem', 
                    py: 1.5,
                    bgcolor: 'rgba(220, 38, 38, 0.1)',
                    color: theme.palette.error.main,
                    borderColor: theme.palette.error.main,
                  }}
                  variant="outlined"
                />
                <Chip 
                  icon={<BugReportIcon />}
                  label="DEF CON 33" 
                  sx={{ 
                    fontSize: '0.9rem', 
                    py: 1.5,
                    bgcolor: 'rgba(220, 38, 38, 0.1)',
                    color: theme.palette.error.main,
                    borderColor: theme.palette.error.main,
                  }}
                  variant="outlined"
                />
                <Chip 
                  label="KubeCon EU" 
                  sx={{ fontSize: '0.9rem', py: 1.5 }}
                  variant="outlined"
                />
                <Chip 
                  label="AI Engineering World's Fair" 
                  sx={{ fontSize: '0.9rem', py: 1.5 }}
                  variant="outlined"
                />
              </Stack>
            </Box>
          </Box>
        </Container>

        {/* Developer Endorsements */}
        <Box sx={{ bgcolor: '#f8fafc', py: 6, mt: 8 }}>
          <Container maxWidth="lg">
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={8}>
                <Card 
                  sx={{ 
                    background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)',
                    color: 'white',
                    p: 3,
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" spacing={2}>
                    <FormatQuoteIcon sx={{ fontSize: 40, opacity: 0.3 }} />
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                        Paige Bailey - Google GenAI Developer Relations
                      </Typography>
                      <Typography variant="body1" sx={{ fontStyle: 'italic', mb: 2 }}>
                        "Using Promptfoo for Gemini 2.0 evals is so nice for quick checks"
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
                        "In case you missed it, Promptfoo just published new docs for Google AI Studio integration!"
                      </Typography>
                      <Stack direction="row" spacing={2}>
                        <Link 
                          href="https://www.linkedin.com/posts/dynamicwebpaige_using-promptfoo-for-gemini-20-evals-is-activity-7294203801475891201-Rdvd"
                          target="_blank"
                          style={{ color: 'white', textDecoration: 'underline' }}
                        >
                          View Post 1 →
                        </Link>
                        <Link 
                          href="https://www.linkedin.com/posts/dynamicwebpaige_in-case-you-missed-it-promptfoo-just-activity-7324596343480442880-tZkD"
                          target="_blank"
                          style={{ color: 'white', textDecoration: 'underline' }}
                        >
                          View Post 2 →
                        </Link>
                      </Stack>
                    </Box>
                  </Stack>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Stack spacing={2}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Industry Recognition
                    </Typography>
                    <Typography variant="body2" paragraph>
                      <strong>Comet ML:</strong> "Promptfoo is listed first among open-source evaluation options"
                    </Typography>
                    <Link 
                      href="https://www.comet.com/site/blog/llm-evaluation-frameworks/"
                      target="_blank"
                    >
                      Read Analysis →
                    </Link>
                  </Paper>
                </Stack>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Live Events & Conferences Section */}
        <Box sx={{ bgcolor: '#1a1a2e', color: 'white', py: 8 }}>
          <Container maxWidth="lg">
            <Typography 
              variant="h3" 
              sx={{ 
                textAlign: 'center',
                mb: 2,
                fontWeight: 700,
              }}
            >
              Speaking at Major Security & AI Conferences
            </Typography>
            <Typography 
              variant="body1" 
              sx={{ 
                textAlign: 'center',
                mb: 6,
                opacity: 0.9,
                maxWidth: 800,
                mx: 'auto',
              }}
            >
              From Black Hat to KubeCon, we're sharing our expertise at the world's premier security and developer events
            </Typography>

            {/* Featured Events */}
            <Grid container spacing={3} sx={{ mb: 6 }}>
              {/* Black Hat USA */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    bgcolor: 'rgba(220, 38, 38, 0.1)',
                    border: '2px solid',
                    borderColor: theme.palette.error.main,
                  }}
                >
                  <CardContent sx={{ p: 4 }}>
                    <Stack direction="row" alignItems="center" spacing={2} mb={3}>
                      <ShieldIcon sx={{ fontSize: 40, color: theme.palette.error.main }} />
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: theme.palette.error.main }}>
                          Black Hat USA 2025
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                          August 6-7, Las Vegas
                        </Typography>
                      </Box>
                    </Stack>
                    
                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="h6" sx={{ fontSize: '1.1rem', mb: 1 }}>
                          AI Summit Keynote
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1, opacity: 0.9 }}>
                          "Securing AI at Scale with Adaptive Red-Teaming" - Ian Webster, CEO
                        </Typography>
                      </Box>
                      
                      <Box>
                        <Typography variant="h6" sx={{ fontSize: '1.1rem', mb: 1 }}>
                          Arsenal Labs Demo
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
                          Live demonstration booth #4712 with hands-on red teaming
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={2}>
                        <Button 
                          variant="contained"
                          size="small"
                          sx={{
                            bgcolor: theme.palette.error.main,
                            '&:hover': {
                              bgcolor: theme.palette.error.dark,
                            },
                          }}
                          href="https://www.blackhat.com/us-25/ai-summit.html"
                          target="_blank"
                        >
                          AI Summit Details
                        </Button>
                        <Button 
                          variant="outlined"
                          size="small"
                          sx={{
                            borderColor: theme.palette.error.main,
                            color: theme.palette.error.main,
                          }}
                          href="https://www.promptfoo.dev/events/blackhat-2025/"
                          target="_blank"
                        >
                          Event Info
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              {/* DEF CON */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    bgcolor: 'rgba(220, 38, 38, 0.1)',
                    border: '2px solid',
                    borderColor: theme.palette.error.main,
                  }}
                >
                  <CardContent sx={{ p: 4 }}>
                    <Stack direction="row" alignItems="center" spacing={2} mb={3}>
                      <BugReportIcon sx={{ fontSize: 40, color: theme.palette.error.main }} />
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: theme.palette.error.main }}>
                          DEF CON 33
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.8 }}>
                          August 9, Las Vegas
                        </Typography>
                      </Box>
                    </Stack>
                    
                    <Typography variant="h6" sx={{ fontSize: '1.1rem', mb: 1 }}>
                      Promptfoo Party
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 3, opacity: 0.9 }}>
                      Exclusive event for AI security researchers at the Millennium FANDOM Bar. 
                      Join us for demos, discussions, and networking with the red teaming community.
                    </Typography>

                    <Button 
                      variant="contained"
                      size="small"
                      sx={{
                        bgcolor: theme.palette.error.main,
                        '&:hover': {
                          bgcolor: theme.palette.error.dark,
                        },
                      }}
                      href="https://www.promptfoo.dev/events/defcon-2025/"
                      target="_blank"
                    >
                      RSVP for DEF CON Party
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Additional Events Grid */}
            <Grid container spacing={3}>
              {/* KubeCon */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(255, 255, 255, 0.05)' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main }}>
                      KubeCon + CloudNativeCon EU
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
                      "Open-Source Tools to Empower Ethical & Robust AI" - CNCF AI WG Panel
                    </Typography>
                    <Link 
                      href="https://www.youtube.com/watch?v=Fo56gmeTvHU"
                      target="_blank"
                      style={{ color: theme.palette.primary.light }}
                    >
                      Watch Recording →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* AI Engineering World's Fair */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(255, 255, 255, 0.05)' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main }}>
                      AI Engineering World's Fair
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
                      "Lessons from Deploying Clyde AI - eval culture & Promptfoo" - Ian Webster
                    </Typography>
                    <Link 
                      href="https://medium.com/99p-labs/reflections-on-the-2024-ai-engineering-worlds-fair-d93eee7239f5"
                      target="_blank"
                      style={{ color: theme.palette.primary.light }}
                    >
                      Event Recap →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Voxxed Days */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(255, 255, 255, 0.05)' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main }}>
                      Voxxed Days Crete
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
                      "Evaluating & Securing LLMs: DeepEval, Vertex AI, Promptfoo" - Mete Atamel (Google)
                    </Typography>
                    <Link 
                      href="https://crete.voxxeddays.com/speaker?id=2561"
                      target="_blank"
                      style={{ color: theme.palette.primary.light }}
                    >
                      Speaker Details →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* CyberBytes Live */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(255, 255, 255, 0.05)' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main }}>
                      CyberBytes Live Conference
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
                      "Securing AI at Scale" - Full conference keynote by Ian Webster
                    </Typography>
                    <Link 
                      href="https://www.youtube.com/watch?v=HVVB3yn4l2g"
                      target="_blank"
                      style={{ color: theme.palette.primary.light }}
                    >
                      Watch Talk →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* AWS Workshop */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(255, 255, 255, 0.05)' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ color: theme.palette.warning.main }}>
                      AWS Official Workshop
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
                      "Mastering LLM Evaluation - Hands-On with Bedrock & Promptfoo" (Self-paced lab)
                    </Typography>
                    <Link 
                      href="https://catalog.workshops.aws/promptfoo/"
                      target="_blank"
                      style={{ color: theme.palette.warning.light }}
                    >
                      Start Workshop →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* OpenAI Build Hour */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(255, 255, 255, 0.05)' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ color: theme.palette.primary.main }}>
                      OpenAI Build Hour
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
                      Featured session on "Prompt Testing & Evaluation with Promptfoo"
                    </Typography>
                    <Link 
                      href="https://vimeo.com/1023317525"
                      target="_blank"
                      style={{ color: theme.palette.primary.light }}
                    >
                      Watch Session →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Key Differentiators Section */}
        <Box sx={{ bgcolor: 'background.paper', py: 8 }}>
          <Container maxWidth="lg">
            <Typography 
              variant="h3" 
              sx={{ 
                textAlign: 'center',
                mb: 6,
                fontWeight: 700,
              }}
            >
              Why Security Leaders Choose Promptfoo
            </Typography>

            <Grid container spacing={3}>
                              <Grid item xs={12} md={3}>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 3, 
                      height: '100%', 
                      textAlign: 'center',
                      border: '2px solid',
                      borderColor: theme.palette.error.light,
                      bgcolor: 'rgba(239, 68, 68, 0.05)',
                    }}
                  >
                    <BugReportIcon sx={{ fontSize: 48, color: theme.palette.error.main, mb: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    Dynamic Attack Generation
                  </Typography>
                  <Typography variant="body2">
                    Not just static tests - our AI generates novel attack vectors specific to your system
                  </Typography>
                </Paper>
              </Grid>

                              <Grid item xs={12} md={3}>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 3, 
                      height: '100%', 
                      textAlign: 'center',
                      border: '2px solid',
                      borderColor: theme.palette.error.light,
                      bgcolor: 'rgba(239, 68, 68, 0.05)',
                    }}
                  >
                    <SecurityIcon sx={{ fontSize: 48, color: theme.palette.error.main, mb: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    OWASP LLM Top 10
                  </Typography>
                  <Typography variant="body2">
                    Complete coverage of all OWASP security vulnerabilities out of the box
                  </Typography>
                </Paper>
              </Grid>

                              <Grid item xs={12} md={3}>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 3, 
                      height: '100%', 
                      textAlign: 'center',
                      border: '2px solid',
                      borderColor: theme.palette.error.light,
                      bgcolor: 'rgba(239, 68, 68, 0.05)',
                    }}
                  >
                    <SpeedIcon sx={{ fontSize: 48, color: theme.palette.error.main, mb: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    CI/CD Integration
                  </Typography>
                  <Typography variant="body2">
                    Catch vulnerabilities before deployment with automated security gates
                  </Typography>
                </Paper>
              </Grid>

                              <Grid item xs={12} md={3}>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 3, 
                      height: '100%', 
                      textAlign: 'center',
                      border: '2px solid',
                      borderColor: theme.palette.error.light,
                      bgcolor: 'rgba(239, 68, 68, 0.05)',
                    }}
                  >
                    <BusinessIcon sx={{ fontSize: 48, color: theme.palette.error.main, mb: 2 }} />
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    Enterprise Ready
                  </Typography>
                  <Typography variant="body2">
                    SOC2 compliant, self-hosted options, and dedicated support
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* Resources Hub */}
        <Container maxWidth="lg" sx={{ py: 8 }}>
          <Typography 
            variant="h3" 
            sx={{ 
              textAlign: 'center',
              mb: 2,
              fontWeight: 700,
            }}
          >
            Learn From the Best
          </Typography>
          <Typography 
            variant="body1" 
            sx={{ 
              textAlign: 'center',
              mb: 6,
              color: 'text.secondary',
              maxWidth: 800,
              mx: 'auto',
            }}
          >
            Training courses, research papers, and community resources to master AI security and quality testing
          </Typography>

          {/* Featured Security Resources */}
          <Box mb={8}>
            <Typography 
              variant="h4" 
              sx={{ 
                mb: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: theme.palette.error.main,
              }}
            >
              <ShieldIcon /> Security & Red Teaming Resources
            </Typography>

            <Grid container spacing={3}>
              {/* Red Teaming Comparison */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    borderTop: `4px solid ${theme.palette.error.main}`,
                  }}
                >
                  <CardContent>
                    <Chip label="2025 Analysis" size="small" color="error" sx={{ mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Red-Teaming Tools Showdown: Promptfoo Wins
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Independent comparison of Promptfoo vs DeepTeam vs PyRIT vs Garak shows Promptfoo 
                      leading in test coverage, ease of use, and attack sophistication.
                    </Typography>
                    <Link 
                      href="https://dev.to/ayush7614/promptfoo-vs-deepteam-vs-pyrit-vs-garak-the-ultimate-red-teaming-showdown-for-llms-48if"
                      target="_blank"
                    >
                      Read Full Comparison →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Security Research */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    borderTop: `4px solid ${theme.palette.error.main}`,
                  }}
                >
                  <CardContent>
                    <Chip label="Research" size="small" color="error" sx={{ mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      DeepSeek AI Censorship Analysis
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Our research revealing 85% censorship rate in DeepSeek models cited by 
                      15+ papers and featured on major podcasts.
                    </Typography>
                    <Link href="/blog/deepseek-censorship/">
                      Read Research →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Security Tutorial */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Attacking LLMs with Promptfoo
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Hands-on security tutorial demonstrating advanced red-team techniques.
                    </Typography>
                    <Link 
                      href="https://medium.com/@watson0x90/attacking-llms-with-promptfoo-362970935552"
                      target="_blank"
                    >
                      Start Tutorial →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* OWASP Guide */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      OWASP LLM Testing Guide
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Complete guide to testing all OWASP LLM Top 10 vulnerabilities.
                    </Typography>
                    <Link href="/docs/red-team/">
                      View Guide →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Enterprise Security */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Enterprise Security Checklist
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Best practices for implementing AI security at scale.
                    </Typography>
                    <Link href="/contact/">
                      Get Enterprise Support →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Local Model Red Teaming */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    borderLeft: `4px solid ${theme.palette.error.main}`,
                  }}
                >
                  <CardContent>
                    <Chip label="NEW" size="small" color="error" sx={{ mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Red-Teaming DeepSeek R1 with Ollama
                    </Typography>
                    <Typography variant="body2" paragraph>
                      "Turning My Model into a Cyber-Warzone" - Hands-on guide to red-teaming local models 
                      using Promptfoo × Ollama × DeepSeek R1.
                    </Typography>
                    <Link 
                      href="https://dev.to/ayush7614/promptfoo-x-ollama-x-deepseek-r1-turning-my-model-into-a-cyber-warzone-3ef5"
                      target="_blank"
                    >
                      Try It Yourself →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* AWS Prompt Flows */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    borderLeft: `4px solid ${theme.palette.warning.main}`,
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={1} mb={2}>
                      <Chip label="AWS" size="small" sx={{ bgcolor: '#ff9900', color: 'white' }} />
                      <Chip label="Official" size="small" variant="outlined" />
                    </Stack>
                    <Typography variant="h6" gutterBottom>
                      AWS Bedrock Prompt Flows Integration
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Official AWS guide shows how to wire Prompt Flows to Promptfoo CLI for automated 
                      evaluation and release gating at scale.
                    </Typography>
                    <Link 
                      href="https://aws.amazon.com/blogs/machine-learning/evaluating-prompts-at-scale-with-prompt-management-and-prompt-flows-for-amazon-bedrock/"
                      target="_blank"
                    >
                      Read AWS Blog →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* Quality & Engineering Resources */}
          <Box mb={8}>
            <Typography 
              variant="h4" 
              sx={{ 
                mb: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: theme.palette.primary.main,
              }}
            >
              <AssessmentIcon /> Quality & Engineering Resources
            </Typography>

            <Grid container spacing={3}>
              {/* OpenAI Course */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    borderTop: `4px solid ${theme.palette.primary.main}`,
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={1} mb={2}>
                      <Chip label="OpenAI" size="small" color="primary" />
                      <Chip label="Official" size="small" variant="outlined" />
                    </Stack>
                    <Typography variant="h6" gutterBottom>
                      OpenAI Build Hour: Prompt Testing
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Featured in OpenAI's official Build Hour series with hands-on prompt testing techniques.
                    </Typography>
                    <Link 
                      href="https://vimeo.com/1023317525"
                      target="_blank"
                    >
                      Watch Video →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Anthropic Course */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    borderTop: `4px solid ${theme.palette.primary.main}`,
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={1} mb={2}>
                      <Chip label="Anthropic" size="small" color="primary" />
                      <Chip label="9 Lessons" size="small" variant="outlined" />
                    </Stack>
                    <Typography variant="h6" gutterBottom>
                      Anthropic Prompt Evaluations Course
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Comprehensive course covering basic to advanced model-graded evaluations using Promptfoo.
                    </Typography>
                    <Link 
                      href="https://github.com/anthropics/courses/tree/master/prompt_evaluations"
                      target="_blank"
                    >
                      Start Course →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* AWS Workshop */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      AWS LLM Evaluation Workshop
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Master evaluation with Amazon Bedrock and Promptfoo.
                    </Typography>
                    <Link 
                      href="https://catalog.us-east-1.prod.workshops.aws/promptfoo/en-US"
                      target="_blank"
                    >
                      Join Workshop →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Simon Willison */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      "Most Mature Open-Source Option"
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Simon Willison's deep dive calling Promptfoo the leader.
                    </Typography>
                    <Link 
                      href="https://simonwillison.net/2025/Apr/24/exploring-promptfoo/"
                      target="_blank"
                    >
                      Read Analysis →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Vertex AI Guide */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Google Vertex AI Integration
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Official guide for using Promptfoo with Vertex AI.
                    </Typography>
                    <Link 
                      href="https://atamel.dev/posts/2024/11-04_promptfoo_vertexai/"
                      target="_blank"
                    >
                      View Guide →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Scale Evaluation Tutorial */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    borderTop: `4px solid ${theme.palette.primary.main}`,
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={1} mb={2}>
                      <Chip label="Towards AI" size="small" color="primary" />
                      <Chip label="NEW" size="small" color="error" />
                    </Stack>
                    <Typography variant="h6" gutterBottom>
                      Evaluating LLMs at Scale with Promptfoo
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Comprehensive tutorial showing YAML configuration matrices and GitHub Actions 
                      integration for continuous evaluation pipelines.
                    </Typography>
                    <Link 
                      href="https://pub.towardsai.net/evaluating-llms-at-scale-with-promptfoo-0cf3fa20e1eb"
                      target="_blank"
                    >
                      Read Tutorial →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Google Guardrails Comparison */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Promptfoo vs LLM Guard vs Vertex AI
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Google DevRel follow-up comparing guardrail approaches across platforms.
                    </Typography>
                    <Link 
                      href="https://atamel.dev/posts/2024/11-04_promptfoo_vertexai/"
                      target="_blank"
                    >
                      Read Comparison →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* Research Papers Section */}
          <Box mb={8}>
            <Typography 
              variant="h4" 
              sx={{ 
                mb: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <ScienceIcon /> Academic Research
              <Chip label="21+ Papers" size="small" color="secondary" />
            </Typography>

            <Grid container spacing={3}>
              {/* Featured Paper 1 */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    border: '2px solid',
                    borderColor: 'secondary.main',
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={1} mb={2}>
                      <Chip label="Microsoft Research" size="small" color="secondary" />
                      <Chip label="2025" size="small" variant="outlined" />
                    </Stack>
                    <Typography variant="h6" gutterBottom>
                      PromptPex: Automatic Test Generation
                    </Typography>
                    <Typography variant="body2" paragraph>
                      32-page empirical study benchmarking auto-generated tests against Promptfoo's 
                      assertion-based testing framework.
                    </Typography>
                    <Link 
                      href="https://arxiv.org/pdf/2503.05070"
                      target="_blank"
                    >
                      Read Paper →
                    </Link>
                  </CardContent>
                </Card>
              </Grid>

              {/* Featured Paper 2 */}
              <Grid item xs={12} md={6}>
                <Card 
                  sx={{ 
                    height: '100%',
                    border: '2px solid',
                    borderColor: 'secondary.main',
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={1} mb={2}>
                      <Chip label="Uses Our Dataset" size="small" color="secondary" />
                      <Chip label="AI Safety" size="small" variant="outlined" />
                    </Stack>
                    <Typography variant="h6" gutterBottom>
                      Mixture-of-Tunable-Experts: DeepSeek-R1
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Uses Promptfoo's CCP-Sensitive-Prompts dataset for interpretability research 
                      on the DeepSeek reasoning model.
                    </Typography>
                    <Stack direction="row" spacing={2}>
                      <Link 
                        href="https://arxiv.org/pdf/2502.11096"
                        target="_blank"
                      >
                        Read Paper →
                      </Link>
                      <Link 
                        href="https://huggingface.co/datasets/promptfoo/CCP-sensitive-prompts"
                        target="_blank"
                        style={{ fontSize: '0.875rem' }}
                      >
                        View Dataset
                      </Link>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Box textAlign="center" mt={3}>
              <Button 
                variant="outlined"
                size="large"
                onClick={() => setExpandedSection(expandedSection === 'research' ? false : 'research')}
                endIcon={<ExpandMoreIcon />}
              >
                View All 21 Research Papers
              </Button>
            </Box>
          </Box>

          {/* Community Section */}
          <Box mb={8}>
            <Typography 
              variant="h4" 
              sx={{ 
                mb: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <GroupsIcon /> Join the Community
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', textAlign: 'center' }}>
                  <CardContent sx={{ p: 4 }}>
                    <GroupsIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Discord Community
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Join 2,000+ practitioners discussing AI security and quality
                    </Typography>
                    <Button 
                      variant="contained" 
                      href="https://discord.gg/promptfoo" 
                      fullWidth
                    >
                      Join Discord
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', textAlign: 'center' }}>
                  <CardContent sx={{ p: 4 }}>
                    <StarIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      GitHub Repository
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Star us on GitHub and contribute to the project
                    </Typography>
                    <Button 
                      variant="contained" 
                      href="https://github.com/promptfoo/promptfoo" 
                      target="_blank"
                      fullWidth
                    >
                      Star on GitHub
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%', textAlign: 'center' }}>
                  <CardContent sx={{ p: 4 }}>
                    <ArticleIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Newsletter
                    </Typography>
                    <Typography variant="body2" paragraph>
                      Get weekly updates on AI security and testing
                    </Typography>
                    <Button 
                      variant="contained" 
                      href="/newsletter" 
                      fullWidth
                    >
                      Subscribe
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Upcoming Events CTA */}
            <Card 
              sx={{ 
                mt: 4,
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: 'white',
              }}
            >
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                  🎯 Meet Us at Black Hat & DEF CON!
                </Typography>
                <Typography variant="body1" paragraph sx={{ mb: 3, opacity: 0.95 }}>
                  Join us in Las Vegas this August for exclusive demos, talks, and networking opportunities
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
                  <Button
                    variant="contained"
                    sx={{
                      backgroundColor: 'white',
                      color: '#dc2626',
                      '&:hover': {
                        backgroundColor: '#f3f4f6',
                      },
                    }}
                    href="https://www.promptfoo.dev/events/blackhat-2025/"
                    target="_blank"
                  >
                    Black Hat Details
                  </Button>
                  <Button
                    variant="outlined"
                    sx={{
                      borderColor: 'white',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderColor: 'white',
                      },
                    }}
                    href="https://www.promptfoo.dev/events/defcon-2025/"
                    target="_blank"
                  >
                    RSVP for DEF CON Party
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Box>

          {/* Expandable Sections */}
          <Box mb={6}>
            {/* Research Papers Accordion */}
            <Accordion 
              expanded={expandedSection === 'research'} 
              onChange={handleAccordionChange('research')}
              sx={{ mb: 2 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <ScienceIcon sx={{ mr: 2, color: 'primary.main' }} />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h5">All Research Papers</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Complete list of 21+ academic papers citing Promptfoo
                    </Typography>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {/* Research papers content would go here - keeping it simple for now */}
                <Typography>
                  Full list of research papers available in the original community page...
                </Typography>
              </AccordionDetails>
            </Accordion>

            {/* More expandable sections can be added here */}
          </Box>

          {/* Final CTA */}
          <Paper 
            sx={{ 
              p: 6, 
              textAlign: 'center',
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              color: 'white',
            }}
          >
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
              Ready to Secure Your AI?
            </Typography>
            <Typography variant="h6" paragraph sx={{ opacity: 0.95, mb: 4 }}>
              Join thousands of security and engineering teams using Promptfoo
            </Typography>
            <Stack 
              direction={{ xs: 'column', sm: 'row' }} 
              spacing={2} 
              justifyContent="center"
            >
              <Button
                variant="contained"
                size="large"
                sx={{
                  backgroundColor: 'white',
                  color: '#dc2626',
                  px: 4,
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: '#f3f4f6',
                  },
                }}
                href="/contact/"
              >
                Get Enterprise Demo
              </Button>
              <Button
                variant="outlined"
                size="large"
                sx={{
                  borderColor: 'white',
                  color: 'white',
                  px: 4,
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderColor: 'white',
                  },
                }}
                href="/docs/red-team/"
              >
                Start Free Trial
              </Button>
            </Stack>
          </Paper>
        </Container>
      </Box>
    </ThemeProvider>
  );
};

export default function Community() {
  return (
    <Layout
      title="Community | Promptfoo - The AI Red Teaming Platform"
      description="Join the Promptfoo community. Access training from OpenAI and Anthropic, read research papers, and connect with 100,000+ developers securing AI systems."
    >
      <CommunityContent />
    </Layout>
  );
}
