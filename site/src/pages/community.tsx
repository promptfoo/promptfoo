import React from 'react';
import Link from '@docusaurus/Link';
import { useColorMode } from '@docusaurus/theme-common';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './community.module.css';

// Material UI imports - keeping minimal
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';

// Icons
import SchoolIcon from '@mui/icons-material/School';
import ScienceIcon from '@mui/icons-material/Science';
import ArticleIcon from '@mui/icons-material/Article';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import GroupsIcon from '@mui/icons-material/Groups';
import BusinessIcon from '@mui/icons-material/Business';
import SecurityIcon from '@mui/icons-material/Security';
import StarIcon from '@mui/icons-material/Star';
import ShieldIcon from '@mui/icons-material/Shield';
import BugReportIcon from '@mui/icons-material/BugReport';
import AssessmentIcon from '@mui/icons-material/Assessment';

const CommunityContent = () => {
  const { colorMode } = useColorMode();

  return (
    <Box className={styles.communityPage}>
      {/* Hero Section - Clean and Simple */}
      <header className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <h1 className={styles.heroTitle}>
            The AI Security Community
          </h1>
          <p className={styles.heroSubtitle}>
            Join 100,000+ developers using Promptfoo for AI red teaming and evaluation
          </p>
          
          {/* Simple event announcement */}
          <div className={styles.eventBadge}>
            <Chip 
              icon={<ShieldIcon />}
              label="Speaking at Black Hat USA 2025 AI Summit" 
              component="a"
              href="https://www.blackhat.com/us-25/ai-summit.html"
              target="_blank"
              clickable
              className={styles.eventChip}
            />
          </div>

          <div className={styles.heroButtons}>
            <Link className="button button--primary button--lg" to="/docs/red-team/">
              Start Red Teaming
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/getting-started/">
              Explore Evaluation
            </Link>
          </div>

          {/* Simple stats */}
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <strong>100K+</strong>
              <span>Developers</span>
            </div>
            <div className={styles.stat}>
              <strong>5K+</strong>
              <span>GitHub Stars</span>
            </div>
            <div className={styles.stat}>
              <strong>21+</strong>
              <span>Research Papers</span>
            </div>
            <div className={styles.stat}>
              <strong>96%</strong>
              <span>Attack Detection</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {/* Trusted By Section */}
        <section className={styles.trustedBySection}>
          <div className="container">
            <h2 className="text--center">Trusted by Industry Leaders</h2>
            
            <div className={styles.logoGrid}>
              <div className={styles.logoItem}>
                <img src="/img/logos/doordash.png" alt="DoorDash" />
              </div>
              <div className={styles.logoItem}>
                <img src="/img/logos/shopify.svg" alt="Shopify" />
              </div>
              <div className={styles.logoItem}>
                <img src="/img/logos/semgrep.svg" alt="Semgrep" />
              </div>
              <div className={styles.logoItem}>
                <span>Google Cloud</span>
              </div>
              <div className={styles.logoItem}>
                <span>AWS</span>
              </div>
              <div className={styles.logoItem}>
                <span>Microsoft</span>
              </div>
            </div>

            {/* Platform Integrations */}
            <div className={styles.integrations}>
              <p className="text--center">Official Integrations:</p>
              <div className={styles.integrationChips}>
                <Chip 
                  label="AWS Bedrock" 
                  component="a"
                  href="https://aws.amazon.com/blogs/machine-learning/evaluating-prompts-at-scale-with-prompt-management-and-prompt-flows-for-amazon-bedrock/"
                  target="_blank"
                  clickable
                />
                <Chip 
                  label="Google Vertex AI" 
                  component="a"
                  href="https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview"
                  target="_blank"
                  clickable
                />
                <Chip 
                  label="Langfuse" 
                  component="a"
                  href="https://langfuse.com/docs/integrations/promptfoo"
                  target="_blank"
                  clickable
                />
                <Chip 
                  label="Portkey AI" 
                  component="a"
                  href="https://portkey.ai/blog/implementing-evals-as-a-core-part-of-ai-development"
                  target="_blank"
                  clickable
                />
              </div>
            </div>
          </div>
        </section>

        {/* Success Stories */}
        <section className={styles.successSection}>
          <div className="container">
            <h2 className="text--center margin-bottom--lg">Success Stories</h2>
            
            <div className="row">
              <div className="col col--6">
                <Card className={styles.successCard}>
                  <CardContent>
                    <h3>
                      <SecurityIcon /> Semgrep: 96% Attack Detection
                    </h3>
                    <p>
                      "Promptfoo identified vulnerabilities in our AI assistant with 96% accuracy, 
                      dramatically improving our security posture."
                    </p>
                    <Link to="https://semgrep.dev/blog/2025/building-an-appsec-ai-that-security-researchers-agree-with-96-of-the-time">
                      Read Case Study →
                    </Link>
                  </CardContent>
                </Card>
              </div>
              
              <div className="col col--6">
                <Card className={styles.successCard}>
                  <CardContent>
                    <h3>
                      <BusinessIcon /> DoorDash: Production RAG Testing
                    </h3>
                    <p>
                      "Using Promptfoo to evaluate our production RAG chatbot for accuracy 
                      and hallucinations."
                    </p>
                    <Link to="https://doordash.engineering/2024/08/22/how-doordash-built-an-ensemble-learning-model-for-time-series-forecasting/">
                      Engineering Blog →
                    </Link>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Press Quote */}
            <div className={styles.pressQuote}>
              <FormatQuoteIcon />
              <p>
                "DeepSeek's AI avoids answering 85% of sensitive prompts... 
                according to research by Andreessen Horowitz-backed Promptfoo"
              </p>
              <cite>
                — TechCrunch, <Link to="https://techcrunch.com/2025/01/29/deepseeks-ai-avoids-answering-85-of-prompts-on-sensitive-topics-related-to-china/">January 2025</Link>
              </cite>
            </div>
          </div>
        </section>

        {/* Resources Section */}
        <section className={styles.resourcesSection}>
          <div className="container">
            <h2 className="text--center margin-bottom--lg">Learn & Connect</h2>
            
            <div className="row">
              {/* Courses */}
              <div className="col col--4">
                <Card className={styles.resourceCard}>
                  <CardContent>
                    <SchoolIcon className={styles.resourceIcon} />
                    <h3>Official Courses</h3>
                    <ul>
                      <li>
                        <Link to="https://vimeo.com/1023317525">
                          OpenAI Build Hour: Prompt Testing
                        </Link>
                      </li>
                      <li>
                        <Link to="https://github.com/anthropics/courses/tree/master/prompt_evaluations">
                          Anthropic: Prompt Evaluations Course
                        </Link>
                      </li>
                      <li>
                        <Link to="https://catalog.workshops.aws/promptfoo/">
                          AWS: Mastering LLM Evaluation
                        </Link>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Research */}
              <div className="col col--4">
                <Card className={styles.resourceCard}>
                  <CardContent>
                    <ScienceIcon className={styles.resourceIcon} />
                    <h3>Research & Papers</h3>
                    <ul>
                      <li>
                        <Link to="https://arxiv.org/pdf/2503.05070">
                          PromptPex: Test Generation (Microsoft)
                        </Link>
                      </li>
                      <li>
                        <Link to="/blog/deepseek-censorship/">
                          DeepSeek Censorship Analysis
                        </Link>
                      </li>
                      <li>
                        <Link to="https://huggingface.co/datasets/promptfoo/CCP-sensitive-prompts">
                          CCP-Sensitive-Prompts Dataset
                        </Link>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Community */}
              <div className="col col--4">
                <Card className={styles.resourceCard}>
                  <CardContent>
                    <GroupsIcon className={styles.resourceIcon} />
                    <h3>Join the Community</h3>
                    <ul>
                      <li>
                        <Link to="https://discord.gg/promptfoo">
                          Discord: 2,000+ members
                        </Link>
                      </li>
                      <li>
                        <Link to="https://github.com/promptfoo/promptfoo">
                          GitHub: Contribute & Star
                        </Link>
                      </li>
                      <li>
                        <Link to="https://share.hsforms.com/1n3v_Sbe8RQu9pBMjwb5D7Qc8oc3c">
                          Newsletter: Weekly Updates
                        </Link>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Events Section */}
        <section className={styles.eventsSection}>
          <div className="container">
            <h2 className="text--center margin-bottom--lg">Conference Appearances</h2>
            
            <div className={styles.eventsList}>
              <div className={styles.eventItem}>
                <h3>
                  <ShieldIcon /> Black Hat USA 2025
                </h3>
                <p>
                  AI Summit Keynote: "Securing AI at Scale with Adaptive Red-Teaming"
                  <br />
                  Arsenal Labs Demo Booth #4712
                </p>
                <Link to="https://www.blackhat.com/us-25/ai-summit.html">
                  Event Details →
                </Link>
              </div>

              <div className={styles.eventItem}>
                <h3>
                  <BugReportIcon /> DEF CON 33
                </h3>
                <p>
                  Promptfoo Party for AI Security Researchers
                  <br />
                  August 9, Millennium FANDOM Bar
                </p>
                <Link to="https://www.promptfoo.dev/events/defcon-2025/">
                  RSVP →
                </Link>
              </div>

              <div className={styles.eventItem}>
                <h3>More Events</h3>
                <p>
                  KubeCon EU • AI Engineering World's Fair • Voxxed Days • CyberBytes Live
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className={styles.ctaSection}>
          <div className="container text--center">
            <h2>Ready to Secure Your AI?</h2>
            <p className={styles.ctaSubtitle}>
              Join thousands of teams using Promptfoo for AI security and quality
            </p>
            <div className={styles.ctaButtons}>
              <Link className="button button--primary button--lg" to="/contact/">
                Get Enterprise Demo
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/getting-started/">
                Start Free Trial
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Box>
  );
};

export default function Community() {
  return (
    <Layout
      title="Community | Promptfoo"
      description="Join the Promptfoo community. Access training from OpenAI and Anthropic, read research papers, and connect with 100,000+ developers securing AI systems."
    >
      <CommunityContent />
    </Layout>
  );
}
