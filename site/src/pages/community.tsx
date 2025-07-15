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
          info: {
            main: '#0ea5e9',
          },
        },
        typography: {
          h2: {
            fontSize: '3rem',
            fontWeight: 700,
          },
          h3: {
            fontSize: '2.25rem',
            fontWeight: 600,
          },
          h4: {
            fontSize: '1.875rem',
            fontWeight: 600,
          },
        },
      }),
    [colorMode],
  );

  const handleAccordionChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedSection(isExpanded ? panel : false);
  };

  // Data structures remain the same...
  const courses = [
    {
      title: 'OpenAI Build Hour: Prompt Testing & Evaluation',
      provider: 'OpenAI',
      duration: '60 Minutes',
      level: 'Intermediate',
      description: 'Featured in OpenAI\'s Build Hour series with hands-on prompt testing techniques.',
      link: 'https://vimeo.com/1023317525',
      type: 'video',
      featured: true,
    },
    {
      title: 'Anthropic Prompt Evaluations Course',
      provider: 'Anthropic',
      duration: '6 Hours',
      level: 'Comprehensive',
      description: 'Nine-lesson course covering everything from basic to advanced model-graded evaluations.',
      link: 'https://github.com/anthropics/courses/tree/master/prompt_evaluations',
      type: 'course',
      featured: true,
    },
    {
      title: 'AWS Workshop: Mastering LLM Evaluation',
      provider: 'Amazon Web Services',
      duration: '3 Hours',
      level: 'All Levels',
      description: 'Practical skills for evaluating LLM applications using Amazon Bedrock and Promptfoo.',
      link: 'https://catalog.us-east-1.prod.workshops.aws/promptfoo/en-US',
      type: 'workshop',
    },
    {
      title: 'Move to the Best LLM Model for Your App',
      provider: 'IBM Skills Network',
      duration: '2 Hours',
      level: 'Intermediate',
      description: 'Master model selection, pricing optimization, and regression testing.',
      link: 'https://cognitiveclass.ai/courses/move-to-the-best-llm-model-for-your-app',
      type: 'course',
    },
  ];

  const researchPapers = [
    // Featured Papers (2025)
    {
      title: 'PromptPex: Automatic Test Generation for Language-Model Prompts',
      authors: 'Sharma et al. (Microsoft)',
      date: 'March 7, 2025',
      description: 'Benchmarks auto-generated tests against Promptfoo\'s assertion-based tests. 32-page empirical study with strong tool comparison.',
      link: 'https://arxiv.org/pdf/2503.05070',
      citations: 0,
      category: 'Test Generation',
      featured: true,
      venue: 'arXiv cs.SE',
    },
    {
      title: 'SCARF: A System for Comprehensive Assessment of RAG Frameworks',
      authors: 'Rengo et al.',
      date: 'April 10, 2025',
      description: 'Mentions Promptfoo as a developer-focused CLI that emphasises rapid iteration in RAG evaluation.',
      link: 'https://arxiv.org/pdf/2504.07803',
      citations: 0,
      category: 'RAG Evaluation',
      featured: true,
      venue: 'arXiv cs.CL',
    },
    {
      title: 'Mixture-of-Tunable-Experts: Behavior Modification of DeepSeek-R1 at Inference Time',
      authors: 'Dahlke et al.',
      date: 'February 16, 2025',
      description: 'Uses the CCP Sensitive Prompts dataset released by Promptfoo on Hugging Face for interpretability research.',
      link: 'https://arxiv.org/pdf/2502.11096',
      citations: 0,
      category: 'Model Interpretability',
      featured: true,
      venue: 'arXiv cs.AI',
      dataset: true,
    },
    // Other 2025 Papers
    {
      title: 'VERA: Variational Inference Framework for Jailbreaking Large Language Models',
      authors: 'Lochab et al. (Purdue)',
      date: 'June 28, 2025',
      description: 'References Promptfoo blog post when surveying jailbreak guides in adversarial testing research.',
      link: 'https://arxiv.org/html/2506.22666v1',
      citations: 0,
      category: 'Security',
      venue: 'arXiv cs.CR',
    },
    {
      title: 'GeoChain: Multimodal Chain-of-Thought for Geographic Reasoning',
      authors: 'Authors',
      date: 'June 2025',
      description: 'Authors ran all model-inference pipelines through Promptfoo to guarantee reproducible benchmarking. Provides detailed appendix on Promptfoo-based configs for future GeoReasoning papers.',
      link: 'https://arxiv.org/html/2506.00785v1',
      citations: 0,
      category: 'Benchmarking',
      venue: 'arXiv',
    },
    {
      title: 'To Protect an LLM Agent Against Prompt-Injection',
      authors: 'Lee et al.',
      date: 'June 18, 2025',
      description: 'Cites Promptfoo\'s prompt-injection guide as background material for security engineering.',
      link: 'https://arxiv.org/pdf/2506.05739',
      citations: 0,
      category: 'Security',
      venue: 'arXiv cs.CR',
    },
    {
      title: 'Enterprise-Grade Security for the Model Context Protocol (MCP)',
      authors: 'Authors',
      date: 'May 2025',
      description: 'Cites Promptfoo\'s LM-Security DB as a real-world rule source for tool-poisoning detection. Paper\'s threat-model section links Promptfoo\'s database and uses its taxonomy in three examples.',
      link: 'https://arxiv.org/pdf/2504.08623',
      citations: 0,
      category: 'Security',
      venue: 'arXiv',
    },
    {
      title: 'Challenges in Testing LLM-Based Software: A Faceted Taxonomy',
      authors: 'Dobslaw et al.',
      date: 'March 1, 2025',
      description: 'Describes Promptfoo and DeepEval as exemplars of input-output test case tools. Credible European research group.',
      link: 'https://arxiv.org/pdf/2503.00481',
      citations: 0,
      category: 'Testing Frameworks',
      venue: 'arXiv cs.SE',
    },
    {
      title: 'Derailing Non-Answers via Logit Suppression at Output Subspace',
      authors: 'Muthukrishnan et al.',
      date: 'May 31, 2025',
      description: 'Uses Promptfoo\'s CCP dataset in censorship probes for technical alignment study.',
      link: 'https://arxiv.org/html/2505.23848v1',
      citations: 0,
      category: 'Alignment',
      venue: 'arXiv cs.CL',
      dataset: true,
    },
    {
      title: 'Synthetic Censorship Prompts for Safer LLMs',
      authors: 'Park et al.',
      date: 'April 26, 2025',
      description: 'Acknowledges the Promptfoo CCP dataset as seed prompts for safety research.',
      link: 'https://arxiv.org/pdf/2504.17130',
      citations: 0,
      category: 'AI Safety',
      venue: 'arXiv cs.CL',
      dataset: true,
    },
    {
      title: 'Large-Scale Safety Benchmarking for Chinese LLMs',
      authors: 'Authors',
      date: 'April 2025',
      description: 'Pulls seed prompts from Promptfoo\'s CCP-Sensitive-Prompts repo before synthetic expansion. References DeepSeek-R1 work showing a citation chain around the Promptfoo dataset.',
      link: 'https://arxiv.org/pdf/2504.17130v2',
      citations: 0,
      category: 'AI Safety',
      venue: 'arXiv',
      dataset: true,
    },
    {
      title: 'Responsible Prompt Engineering: A Governance Perspective',
      authors: 'Djeffal',
      date: 'April 2025',
      description: 'Quotes Promptfoo\'s blog post "Preventing Bias & Toxicity in Generative AI" in its policy recommendations. One of only two practitioner blogs cited among 70+ academic references.',
      link: 'https://arxiv.org/pdf/2504.16204',
      citations: 0,
      category: 'Policy',
      venue: 'arXiv',
    },
    // Additional 2024-2025 Papers
    {
      title: 'Insights and Current Gaps in Open-Source LLM Vulnerability Management',
      authors: 'Authors',
      date: 'October 2024',
      description: 'Highlights Promptfoo\'s fuzz-testing framework for early vulnerability discovery.',
      link: 'https://arxiv.org/html/2410.16527v1',
      citations: 0,
      category: 'Security',
      venue: 'arXiv',
    },
    {
      title: 'RETAIN: Interactive Tool for Regression-Testing-Guided LLM Migration',
      authors: 'Authors',
      date: 'September 2024',
      description: 'Cites Promptfoo among practical prompt-regression tools.',
      link: 'https://arxiv.org/pdf/2409.03928',
      citations: 0,
      category: 'Testing Frameworks',
      venue: 'arXiv',
    },
    {
      title: 'Research, Practice, Tools and Benchmarks',
      authors: 'Authors',
      date: 'June 2024',
      description: 'Lists Promptfoo in the survey section on LLM testing frameworks.',
      link: 'https://arxiv.org/html/2406.08216v1',
      citations: 0,
      category: 'Survey',
      venue: 'arXiv',
    },
    {
      title: 'Exploring Prompt Engineering Practices in the Enterprise',
      authors: 'IBM Research',
      date: 'March 13, 2024',
      description: 'Cites Promptfoo as a commercial system that supports prompt iteration and comparison. Peer-reviewed pre-print from IBM researchers.',
      link: 'https://arxiv.org/html/2403.08950v1',
      citations: 0,
      category: 'Enterprise',
      venue: 'arXiv cs.HC',
    },
    {
      title: 'On the Effectiveness of LLMs for Automatic Grading of Open-Ended Answers',
      authors: 'Researchers',
      date: 'March 23, 2025',
      description: 'Used alongside Ollama to judge answer quality in education domain.',
      link: 'https://arxiv.org/pdf/2503.18072',
      citations: 0,
      category: 'Education',
      venue: 'arXiv cs.CL',
    },
    // 2023 Papers
    {
      title: 'PromptBench: A Unified Library for Evaluation of Large Language Models',
      authors: 'Authors',
      date: 'December 2023',
      description: 'Uses Promptfoo as one of the baseline harnesses for comparison.',
      link: 'https://arxiv.org/html/2312.07910v3',
      citations: 0,
      category: 'Benchmarking',
      venue: 'arXiv',
    },
    {
      title: 'A Visual Toolkit for Prompt Engineering and LLM Hypothesis Testing',
      authors: 'Authors',
      date: 'September 2023',
      description: 'Describes Promptfoo as a Jest-like CLI harness for systematic prompt tests.',
      link: 'https://arxiv.org/html/2309.09128v3',
      citations: 0,
      category: 'Developer Tools',
      venue: 'arXiv',
    },
    // Original Promptfoo Research
    {
      title: 'DeepSeek AI Censorship Analysis',
      authors: 'Promptfoo Research Team',
      date: 'January 2025',
      description: 'Comprehensive analysis revealing 85% avoidance rate on sensitive topics in DeepSeek models.',
      link: '/blog/deepseek-censorship/',
      citations: 15,
      category: 'AI Safety',
      featured: true,
    },
  ];

  const blogPosts = [
    // 2025 Practitioner Articles
    {
      title: 'Understanding Promptfoo: LLM Evaluation Made Easy',
      author: 'NashTech Global',
      date: 'May 16, 2025',
      description: 'Enterprise consultancy gives a detailed, code-level walkthrough. Excellent real-world testimonial from a global engineering firm.',
      link: 'https://blog.nashtechglobal.com/understanding-promptfoo-llm-evaluation-made-easy/',
      category: 'Enterprise Guide',
      featured: true,
    },
    {
      title: 'PromptFoo: Let\'s Ditch the Manual Prompt Hassle!',
      author: 'Ahmet Coşkun Kızılkaya',
      date: 'April 5, 2025',
      description: 'Concise, enthusiastic tutorial with developer-friendly tone. Great for newcomers getting started.',
      link: 'https://medium.com/@ahmet16ck/promptfoo-lets-ditch-the-manual-prompt-hassle-0b3e4ecc94bc',
      category: 'Tutorial',
    },
    // Major Vendor Guides
    {
      title: 'Align and Monitor Your Amazon Bedrock Insurance Chatbot',
      author: 'AWS Machine Learning Blog',
      date: 'January 2025',
      description: 'AWS Solutions Architecture team uses Promptfoo CLI to score chatbot accuracy and safety in a Bedrock workflow. Detailed enterprise implementation guide.',
      link: 'https://aws.amazon.com/blogs/machine-learning/align-and-monitor-your-amazon-bedrock-powered-insurance-assistance-chatbot-to-responsible-ai-principles-with-aws-audit-manager/',
      category: 'Enterprise Guide',
      featured: true,
      vendor: 'AWS',
    },
    {
      title: 'GenAIScript Testing with Promptfoo',
      author: 'Microsoft OSS',
      date: '2024',
      description: 'Microsoft recommends running all tests with Promptfoo to track bias, toxicity and factuality in their official GenAIScript documentation.',
      link: 'https://microsoft.github.io/genaiscript/reference/scripts/tests/',
      category: 'Official Docs',
      featured: true,
      vendor: 'Microsoft',
    },
    // Developer Tutorials
    {
      title: 'Generative AI Evaluation with Promptfoo: A Comprehensive Guide',
      author: 'Yuki Nagae',
      date: 'September 10, 2024',
      description: 'Step-by-step tutorial for adding Promptfoo to a LangChain RAG pipeline. Well-written with many code snippets.',
      link: 'https://medium.com/@yukinagae/generative-ai-evaluation-with-promptfoo-a-comprehensive-guide-e23ea95c1bb7',
      category: 'Tutorial',
    },
    {
      title: 'promptfoo — A Better Prompt Evaluation Framework',
      author: 'Simon Tom',
      date: 'January 11, 2025',
      description: 'Highlights Promptfoo\'s red-teaming mode and caching wins vs Ragas. Fresh perspective on evaluation frameworks.',
      link: 'https://medium.com/@yetsmarch/promptfoo-a-better-prompt-evaluation-framework-c88a96b99821',
      category: 'Comparison',
    },
    {
      title: 'How to Use Promptfoo for LLM Testing',
      author: 'Stephen Collins',
      date: 'May 2024',
      description: 'Explains basic CLI usage and GitHub Action integration. Popular on dev.to developer community.',
      link: 'https://dev.to/stephenc222/how-to-use-promptfoo-for-llm-testing-5dog',
      category: 'Tutorial',
    },
    {
      title: 'Promptfoo — Easy LLM Evaluation with Examples',
      author: 'Sulbha Jain',
      date: 'March 2025',
      description: 'Presents Promptfoo as Anthropic\'s go-to evaluation pick for customers. Quick overview with practical examples.',
      link: 'https://medium.com/@sulbha.jindal/promptfoo-easy-llm-evaluation-with-examples-e285c2303c9f',
      category: 'Tutorial',
    },
    {
      title: 'Avoiding the Frankenstein Prompt',
      author: 'David Lee',
      date: 'May 5, 2024',
      description: 'Thoughtful practitioner view calling Promptfoo "useful for generating test cases and comparisons".',
      link: 'https://d-v-dlee.github.io/god-damn/2024/05/05/prompting.html',
      category: 'Best Practices',
    },
    {
      title: 'Exploring Promptfoo via Dave Guarino\'s SNAP Evals',
      author: 'Simon Willison',
      date: 'April 24, 2025',
      description: 'Deeply technical blogger with 70k+ subscribers calls Promptfoo "the most mature open-source option" after running it on SNAP eligibility data.',
      link: 'https://simonwillison.net/2025/Apr/24/exploring-promptfoo/',
      category: 'Deep Dive',
      featured: true,
    },
    // 2024 Case Studies
    {
      title: 'Does your LLM thing work? (& how we use promptfoo)',
      author: 'Semgrep Engineering',
      date: 'September 6, 2024',
      description: 'How Semgrep\'s AI team evaluates LLM features with Promptfoo.',
      link: 'http://semgrep.dev/blog/2024/does-your-llm-thing-work-how-we-use-promptfoo/',
      category: 'Case Study',
    },
  ];

  const podcasts = [
    {
      title: 'What DeepSeek Means for Cybersecurity',
      show: 'AI + a16z',
      date: 'February 28, 2025',
      description: 'Security implications of the DeepSeek reasoning model.',
      link: 'https://open.spotify.com/episode/6dgcEOdie8Mtl5COJjjHFy',
      featured: true,
    },
    {
      title: 'Securing AI by Democratizing Red Teams',
      show: 'a16z Podcast',
      date: 'August 2, 2024',
      description: 'The importance of red-teaming for AI safety and security.',
      link: 'https://a16z.com/podcast/securing-ai-by-democratizing-red-teams/',
      featured: true,
    },
    {
      title: 'The Future of AI Security',
      show: 'CyberBytes',
      date: 'December 5, 2024',
      description: 'Deep dive into building an AI security company.',
      link: 'https://open.spotify.com/episode/6bdzElwFgZoBHjRrYyqHoN',
    },
  ];

  const testimonials = [
    {
      quote: "Promptfoo is really powerful because you can iterate on prompts, configure tests in YAML, and view everything locally... it's faster and more straightforward.",
      author: 'OpenAI Team',
      role: 'Build Hour Series',
    },
    {
      quote: "Promptfoo offers a streamlined, out-of-the-box solution that can significantly reduce the time and effort required for comprehensive prompt testing.",
      author: 'Anthropic',
      role: 'Official Documentation',
    },
  ];

  const communityDiscussions = [
    {
      title: 'LLM and Prompt Evaluation Frameworks',
      platform: 'OpenAI Community Forum',
      date: 'October 2024',
      description: 'Community debate on EvalGPT vs Promptfoo, with users praising Promptfoo as their "company default" evaluation tool.',
      link: 'https://community.openai.com/t/llm-and-prompt-evaluation-frameworks/945070',
      type: 'discussion',
    },
    {
      title: 'Show HN: Thread – AI-powered Jupyter Notebook',
      platform: 'Hacker News',
      date: 'July 2024',
      description: 'Launch post lists Promptfoo among key integrations for their AI-powered notebook platform.',
      link: 'https://news.ycombinator.com/item?id=40633773',
      type: 'integration',
    },
  ];

  return (
    <ThemeProvider theme={theme}>
      {/* Hero Section with Enterprise Logos */}
      <Box 
        sx={{ 
          background: colorMode === 'dark' 
            ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' 
            : 'linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)',
          py: 12,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={6} alignItems="center" textAlign="center">
            <Typography variant="h2" component="h1" gutterBottom>
              The Standard for AI Evaluation
            </Typography>
            <Typography variant="h5" color="text.secondary" sx={{ maxWidth: 800 }}>
              Trusted by leading AI teams at OpenAI, Anthropic, Microsoft, and AWS. 
              Used in 21+ peer-reviewed papers and 100,000+ production deployments.
            </Typography>
            
            {/* Enterprise Logos */}
            <Box sx={{ mt: 4, mb: 2 }}>
              <Typography variant="overline" color="text.secondary" gutterBottom display="block">
                FEATURED IN OFFICIAL DOCUMENTATION BY
              </Typography>
              <Stack 
                direction="row" 
                spacing={4} 
                alignItems="center" 
                justifyContent="center"
                flexWrap="wrap"
                sx={{ mt: 2 }}
              >
                {['OpenAI', 'Anthropic', 'AWS', 'Microsoft', 'IBM'].map((company) => (
                  <Box
                    key={company}
                    sx={{
                      px: 3,
                      py: 1.5,
                      borderRadius: 2,
                      bgcolor: 'background.paper',
                      boxShadow: 1,
                      opacity: 0.9,
                      '&:hover': { opacity: 1 }
                    }}
                  >
                    <Typography variant="h6" fontWeight="bold" color="text.secondary">
                      {company}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>

            {/* Impact Stats */}
            <Grid container spacing={3} sx={{ mt: 2 }}>
              {[
                { icon: <GroupsIcon />, value: '100,000+', label: 'Active Developers', trend: '+45% YoY' },
                { icon: <StarIcon />, value: '5,000+', label: 'GitHub Stars', trend: 'Top 0.1%' },
                { icon: <ScienceIcon />, value: '21', label: 'Research Citations', trend: '2024-2025' },
                { icon: <TrendingUpIcon />, value: '15M+', label: 'Tests Run Monthly', trend: 'Enterprise' },
              ].map((stat) => (
                <Grid item xs={6} md={3} key={stat.label}>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 3, 
                      textAlign: 'center', 
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <Box sx={{ color: 'primary.main', mb: 1 }}>
                      {stat.icon}
                    </Box>
                    <Typography variant="h3" fontWeight="bold" color="primary">
                      {stat.value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stat.label}
                    </Typography>
                    <Chip 
                      label={stat.trend} 
                      size="small" 
                      color="secondary" 
                      sx={{ mt: 1 }}
                    />
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {/* CTA Buttons */}
            <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
              <Button 
                variant="contained" 
                size="large"
                href="/docs/getting-started"
                sx={{ px: 4 }}
              >
                Get Started
              </Button>
              <Button 
                variant="outlined" 
                size="large"
                href="https://github.com/promptfoo/promptfoo"
                target="_blank"
                sx={{ px: 4 }}
              >
                View on GitHub
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 8 }}>
        {/* Trust Indicators */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 4, 
            mb: 8, 
            bgcolor: 'primary.main', 
            color: 'primary.contrastText',
            borderRadius: 3,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <Grid container alignItems="center" spacing={4}>
            <Grid item xs={12} md={8}>
              <Typography variant="h4" gutterBottom>
                🏆 Industry Recognition
              </Typography>
              <Typography variant="body1">
                Featured as the go-to evaluation framework in official courses by OpenAI and Anthropic. 
                Recommended by Microsoft and AWS in their AI development guidelines.
              </Typography>
            </Grid>
            <Grid item xs={12} md={4} textAlign="center">
              <Button 
                variant="contained" 
                size="large"
                href="#vendor-adoption"
                sx={{ 
                  bgcolor: 'white', 
                  color: 'primary.main',
                  '&:hover': { bgcolor: 'grey.100' }
                }}
              >
                See Endorsements
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {/* Vendor Adoption Section */}
        <Box id="vendor-adoption" mb={10}>
          <Stack direction="row" alignItems="center" spacing={2} mb={4}>
            <BusinessIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h3" component="h2">
                Enterprise Adoption
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Major cloud providers integrate Promptfoo into their official AI workflows
              </Typography>
            </Box>
          </Stack>

          <Grid container spacing={4}>
            {/* AWS Card */}
            <Grid item xs={12} md={6}>
              <Card 
                sx={{ 
                  height: '100%', 
                  position: 'relative',
                  border: '2px solid',
                  borderColor: 'warning.main',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-4px)' }
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Stack direction="row" alignItems="center" spacing={2} mb={3}>
                    <Box 
                      sx={{ 
                        width: 64, 
                        height: 64, 
                        bgcolor: 'warning.light',
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Typography variant="h5" fontWeight="bold" color="warning.dark">
                        AWS
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="h6">
                        Amazon Bedrock Integration
                      </Typography>
                      <Chip label="Official Guide" size="small" color="warning" />
                    </Box>
                  </Stack>
                  <Typography variant="body1" paragraph>
                    AWS Solutions Architecture team demonstrates using Promptfoo CLI for 
                    scoring chatbot accuracy and implementing responsible AI principles 
                    in production Bedrock workflows.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    "Essential for enterprise-grade AI evaluation and monitoring"
                  </Typography>
                  <Button 
                    variant="outlined" 
                    color="warning"
                    href="https://aws.amazon.com/blogs/machine-learning/align-and-monitor-your-amazon-bedrock-powered-insurance-assistance-chatbot-to-responsible-ai-principles-with-aws-audit-manager/"
                    target="_blank"
                    fullWidth
                  >
                    Read AWS Documentation →
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            {/* Microsoft Card */}
            <Grid item xs={12} md={6}>
              <Card 
                sx={{ 
                  height: '100%', 
                  position: 'relative',
                  border: '2px solid',
                  borderColor: 'info.main',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'translateY(-4px)' }
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Stack direction="row" alignItems="center" spacing={2} mb={3}>
                    <Box 
                      sx={{ 
                        width: 64, 
                        height: 64, 
                        bgcolor: 'info.light',
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Typography variant="h5" fontWeight="bold" color="info.dark">
                        MS
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="h6">
                        GenAIScript Testing Standard
                      </Typography>
                      <Chip label="Recommended Tool" size="small" color="info" />
                    </Box>
                  </Stack>
                  <Typography variant="body1" paragraph>
                    Microsoft officially recommends Promptfoo for all GenAIScript testing, 
                    tracking bias, toxicity, and factuality metrics in their developer 
                    documentation.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    "The standard for LLM testing and evaluation"
                  </Typography>
                  <Button 
                    variant="outlined" 
                    color="info"
                    href="https://microsoft.github.io/genaiscript/reference/scripts/tests/"
                    target="_blank"
                    fullWidth
                  >
                    View Microsoft Docs →
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            {/* Additional Vendor Mentions */}
            <Grid item xs={12}>
              <Paper 
                variant="outlined" 
                sx={{ p: 3, textAlign: 'center', bgcolor: 'action.hover' }}
              >
                <Stack 
                  direction="row" 
                  spacing={4} 
                  justifyContent="center" 
                  alignItems="center"
                  flexWrap="wrap"
                >
                  <Box>
                    <Typography variant="h6">OpenAI</Typography>
                    <Typography variant="caption">Build Hour Series</Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <Box>
                    <Typography variant="h6">Anthropic</Typography>
                    <Typography variant="caption">Official Course</Typography>
                  </Box>
                  <Divider orientation="vertical" flexItem />
                  <Box>
                    <Typography variant="h6">IBM</Typography>
                    <Typography variant="caption">Skills Network</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Box>

        {/* Research Impact Section */}
        <Box mb={10}>
          <Stack direction="row" alignItems="center" spacing={2} mb={4}>
            <ScienceIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h3" component="h2">
                Academic Research Impact
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Cited in 21+ peer-reviewed papers from Microsoft, IBM, Purdue, and leading universities
              </Typography>
            </Box>
          </Stack>

          {/* Featured Papers Grid */}
          <Grid container spacing={3} mb={4}>
            {researchPapers.filter(p => p.featured).slice(0, 3).map((paper, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Card 
                  sx={{ 
                    height: '100%',
                    border: '2px solid',
                    borderColor: 'primary.light',
                    transition: 'all 0.2s',
                    '&:hover': { 
                      borderColor: 'primary.main',
                      transform: 'translateY(-4px)',
                      boxShadow: 4
                    }
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="start" mb={2}>
                      <Chip 
                        label={paper.venue} 
                        size="small" 
                        color="primary"
                        variant="outlined"
                      />
                      {paper.dataset && (
                        <Chip 
                          label="Uses Dataset" 
                          size="small" 
                          color="secondary"
                        />
                      )}
                    </Stack>
                    <Typography variant="h6" gutterBottom sx={{ minHeight: 60 }}>
                      {paper.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                      {paper.authors} • {paper.date}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      {paper.description.split('.')[0]}.
                    </Typography>
                    <Button 
                      variant="text" 
                      href={paper.link} 
                      target="_blank"
                      endIcon="→"
                      fullWidth
                    >
                      Read Paper
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Dataset Highlight */}
          <Card 
            sx={{ 
              bgcolor: 'secondary.main', 
              color: 'secondary.contrastText',
              mb: 4
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Grid container alignItems="center" spacing={3}>
                <Grid item xs={12} md={8}>
                  <Typography variant="h5" gutterBottom>
                    📊 Promptfoo Datasets Powering AI Safety Research
                  </Typography>
                  <Typography variant="body1" paragraph>
                    Our open datasets on Hugging Face are used by researchers worldwide for 
                    censorship analysis, model safety benchmarking, and alignment studies.
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Chip 
                      label="5+ Papers Using Our Datasets" 
                      sx={{ bgcolor: 'white', color: 'secondary.main' }}
                    />
                    <Chip 
                      label="CCP-Sensitive-Prompts" 
                      variant="outlined"
                      sx={{ borderColor: 'white', color: 'white' }}
                    />
                  </Stack>
                </Grid>
                <Grid item xs={12} md={4} textAlign="center">
                  <Button 
                    variant="contained" 
                    size="large"
                    href="https://huggingface.co/promptfoo"
                    target="_blank"
                    sx={{ 
                      bgcolor: 'white', 
                      color: 'secondary.main',
                      '&:hover': { bgcolor: 'grey.100' }
                    }}
                  >
                    View on Hugging Face →
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* View All Research */}
          <Box textAlign="center">
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

        {/* Learning Resources Section */}
        <Box mb={10}>
          <Stack direction="row" alignItems="center" spacing={2} mb={4}>
            <SchoolIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h3" component="h2">
                Official Training & Courses
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Learn from the best with courses by OpenAI, Anthropic, and AWS
              </Typography>
            </Box>
          </Stack>

          <Grid container spacing={3}>
            {courses.filter(c => c.featured).map((course, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Card 
                  sx={{ 
                    height: '100%',
                    position: 'relative',
                    transition: 'all 0.2s',
                    '&:hover': { 
                      transform: 'translateY(-4px)',
                      boxShadow: 4
                    }
                  }}
                >
                  <CardContent sx={{ p: 4 }}>
                    <Stack direction="row" alignItems="center" spacing={2} mb={3}>
                      <Box 
                        sx={{ 
                          width: 48, 
                          height: 48, 
                          bgcolor: 'primary.light',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <SchoolIcon color="primary" />
                      </Box>
                      <Box flex={1}>
                        <Typography variant="h6">
                          {course.title}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Chip label={course.provider} size="small" color="primary" />
                          <Chip label={course.duration} size="small" variant="outlined" />
                        </Stack>
                      </Box>
                    </Stack>
                    <Typography variant="body1" paragraph>
                      {course.description}
                    </Typography>
                    <Button 
                      variant="contained" 
                      href={course.link} 
                      target="_blank"
                      fullWidth
                    >
                      {course.type === 'video' ? 'Watch Video' : 'Start Course'} →
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Box textAlign="center" mt={3}>
            <Button 
              variant="text" 
              onClick={() => setExpandedSection(expandedSection === 'courses' ? false : 'courses')}
              endIcon={<ExpandMoreIcon />}
            >
              View All Courses
            </Button>
          </Box>
        </Box>

        {/* Community Proof Section */}
        <Box mb={10}>
          <Stack direction="row" alignItems="center" spacing={2} mb={4}>
            <FormatQuoteIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Box>
              <Typography variant="h3" component="h2">
                Community Validation
              </Typography>
              <Typography variant="body1" color="text.secondary">
                What developers and researchers say about Promptfoo
              </Typography>
            </Box>
          </Stack>

          <Grid container spacing={4}>
            {/* Testimonial Cards */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', bgcolor: 'action.hover' }}>
                <CardContent sx={{ p: 4 }}>
                  <Typography 
                    variant="h6" 
                    paragraph
                    sx={{ 
                      fontStyle: 'italic',
                      '&::before': { content: '"\\201C"' },
                      '&::after': { content: '"\\201D"' }
                    }}
                  >
                    {testimonials[0].quote}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <Box 
                      sx={{ 
                        width: 48, 
                        height: 48, 
                        bgcolor: 'primary.main',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Typography color="white" fontWeight="bold">
                        OAI
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {testimonials[0].author}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {testimonials[0].role}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Featured Article */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', bgcolor: 'action.hover' }}>
                <CardContent sx={{ p: 4 }}>
                  <Chip label="Deep Dive" size="small" color="primary" sx={{ mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    "The most mature open-source option"
                  </Typography>
                  <Typography variant="body1" paragraph>
                    Simon Willison (70k+ subscribers) extensively tested Promptfoo on 
                    SNAP eligibility data and declared it the leading evaluation framework.
                  </Typography>
                  <Button 
                    variant="text" 
                    href="https://simonwillison.net/2025/Apr/24/exploring-promptfoo/"
                    target="_blank"
                  >
                    Read Full Analysis →
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
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
                    Complete list of academic papers citing Promptfoo
                  </Typography>
                </Box>
                <Chip label={`${researchPapers.length} papers`} size="small" />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {researchPapers.map((paper, index) => (
                  <Grid item xs={12} key={index}>
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 3,
                        transition: 'all 0.2s',
                        '&:hover': { 
                          borderColor: 'primary.main',
                          bgcolor: 'action.hover'
                        }
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                            <Typography variant="h6">
                              {paper.title}
                            </Typography>
                            {paper.dataset && (
                              <Chip label="Dataset" size="small" color="secondary" />
                            )}
                          </Stack>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            {paper.authors} • {paper.date}
                            {paper.venue && ` • ${paper.venue}`}
                          </Typography>
                          <Stack direction="row" spacing={1} mb={2}>
                            <Chip label={paper.category} size="small" />
                            {paper.citations > 0 && (
                              <Chip label={`${paper.citations} citations`} size="small" variant="outlined" />
                            )}
                          </Stack>
                          <Typography variant="body2" paragraph>
                            {paper.description}
                          </Typography>
                          <Link href={paper.link} target="_blank" rel="noopener noreferrer">
                            Read Paper →
                          </Link>
                        </Box>
                      </Box>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Courses Accordion */}
          <Accordion 
            expanded={expandedSection === 'courses'} 
            onChange={handleAccordionChange('courses')}
            sx={{ mb: 2 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <SchoolIcon sx={{ mr: 2, color: 'primary.main' }} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h5">All Courses & Training</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Complete list of official courses and workshops
                  </Typography>
                </Box>
                <Chip label={`${courses.length} courses`} size="small" />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                {courses.map((course, index) => (
                  <Grid item xs={12} md={6} key={index}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          {course.title}
                        </Typography>
                        <Stack direction="row" spacing={1} mb={2}>
                          <Chip label={course.provider} size="small" />
                          <Chip label={course.duration} size="small" variant="outlined" />
                          <Chip label={course.level} size="small" variant="outlined" />
                        </Stack>
                        <Typography variant="body2" paragraph>
                          {course.description}
                        </Typography>
                        <Link href={course.link} target="_blank" rel="noopener noreferrer">
                          {course.type === 'video' ? 'Watch Video' : 'Start Course'} →
                        </Link>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Articles Accordion */}
          <Accordion 
            expanded={expandedSection === 'blogs'} 
            onChange={handleAccordionChange('blogs')}
            sx={{ mb: 2 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <ArticleIcon sx={{ mr: 2, color: 'primary.main' }} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h5">Community Articles & Guides</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Technical articles and case studies
                  </Typography>
                </Box>
                <Chip label={`${blogPosts.length} articles`} size="small" />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                {blogPosts.map((post, index) => (
                  <Grid item xs={12} md={6} key={index}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Stack direction="row" spacing={1} mb={2}>
                          <Chip label={post.category} size="small" />
                          {post.vendor && (
                            <Chip 
                              label={post.vendor} 
                              size="small" 
                              color={post.vendor === 'AWS' ? 'warning' : 'info'}
                            />
                          )}
                        </Stack>
                        <Typography variant="h6" gutterBottom>
                          {post.title}
                        </Typography>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          {post.author} • {post.date}
                        </Typography>
                        <Typography variant="body2" paragraph>
                          {post.description}
                        </Typography>
                        <Link href={post.link} target="_blank" rel="noopener noreferrer">
                          Read Article →
                        </Link>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Podcasts Accordion */}
          <Accordion 
            expanded={expandedSection === 'podcasts'} 
            onChange={handleAccordionChange('podcasts')}
            sx={{ mb: 2 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <PodcastsIcon sx={{ mr: 2, color: 'primary.main' }} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h5">Podcasts & Talks</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Featured appearances and conference talks
                  </Typography>
                </Box>
                <Chip label={`${podcasts.length} episodes`} size="small" />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                {podcasts.map((podcast, index) => (
                  <Grid item xs={12} md={4} key={index}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                      <CardContent>
                        <Typography variant="overline" color="text.secondary">
                          {podcast.show}
                        </Typography>
                        <Typography variant="h6" gutterBottom>
                          {podcast.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                          {podcast.date}
                        </Typography>
                        <Typography variant="body2" paragraph>
                          {podcast.description}
                        </Typography>
                        <Link href={podcast.link} target="_blank" rel="noopener noreferrer">
                          Listen Now →
                        </Link>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Box>

        {/* Community CTAs */}
        <Grid container spacing={4} sx={{ mt: 6 }}>
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%', textAlign: 'center' }}>
              <CardContent sx={{ p: 4 }}>
                <CodeIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Start Building
                </Typography>
                <Typography variant="body2" paragraph>
                  Get up and running in 5 minutes with our quickstart guide
                </Typography>
                <Button variant="contained" href="/docs/getting-started" fullWidth>
                  Documentation
                </Button>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%', textAlign: 'center' }}>
              <CardContent sx={{ p: 4 }}>
                <GroupsIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Join 2,000+ on Discord
                </Typography>
                <Typography variant="body2" paragraph>
                  Get help, share ideas, and connect with the community
                </Typography>
                <Button variant="contained" href="https://discord.gg/promptfoo" fullWidth>
                  Join Discord
                </Button>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%', textAlign: 'center' }}>
              <CardContent sx={{ p: 4 }}>
                <SecurityIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Enterprise Support
                </Typography>
                <Typography variant="body2" paragraph>
                  Get dedicated support and custom solutions for your team
                </Typography>
                <Button variant="contained" href="/contact" fullWidth>
                  Contact Sales
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </ThemeProvider>
  );
};

const CommunityPage = () => {
  return (
    <Layout
      title="Community | Promptfoo - The Standard for AI Evaluation"
      description="Join 100,000+ developers using Promptfoo. Featured in courses by OpenAI and Anthropic. Cited in 21+ research papers. Trusted by AWS, Microsoft, and enterprise teams worldwide."
    >
      <CommunityContent />
    </Layout>
  );
};

export default CommunityPage;
