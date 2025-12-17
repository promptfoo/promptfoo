// Resource Types
export type ResourceCategory =
  | 'getting-started'
  | 'security-research'
  | 'courses'
  | 'community';

export type ResourceType =
  | 'guide'
  | 'blog'
  | 'docs'
  | 'video'
  | 'course'
  | 'event'
  | 'report'
  | 'external';

export interface Resource {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  type: ResourceType;
  url: string;
  isExternal?: boolean;
  source?: string; // e.g., "Anthropic", "AWS", "OpenAI"
  date?: string; // ISO date string
  readTime?: string; // e.g., "5 min"
  duration?: string; // e.g., "6 hours" for courses
  featured?: boolean;
}

// Helper to get category display name
export function getCategoryLabel(category: ResourceCategory): string {
  const labels: Record<ResourceCategory, string> = {
    'getting-started': 'Getting Started',
    'security-research': 'Security Research',
    courses: 'Courses',
    community: 'Community',
  };
  return labels[category];
}

// Helper to get CTA text based on type and external status
export function getCtaText(resource: Resource): string {
  if (resource.isExternal) {
    return `Read on ${resource.source || 'external site'}`;
  }

  const ctaMap: Record<ResourceType, string> = {
    guide: 'Read guide',
    blog: 'Read article',
    docs: 'View docs',
    video: 'Watch video',
    course: 'View course',
    event: 'View event',
    report: 'View report',
    external: 'Learn more',
  };

  return ctaMap[resource.type] || 'Learn more';
}

// Helper to format meta text
export function getMetaText(resource: Resource): string {
  const parts: string[] = [];

  if (resource.source) {
    parts.push(resource.source);
  }

  if (resource.type === 'course' && resource.duration) {
    parts.push(resource.duration);
  } else if (resource.type === 'blog' && resource.date) {
    const date = new Date(resource.date);
    parts.push(date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
  } else if (resource.readTime) {
    parts.push(resource.readTime);
  }

  return parts.join(' · ') || '';
}

// Resource Data
export const resources: Resource[] = [
  // ===== GETTING STARTED (8) =====
  {
    id: 'red-team-quickstart',
    title: 'Red Team Quickstart',
    description: 'Get started with AI red teaming in 5 minutes. Run your first vulnerability scan against an LLM application.',
    category: 'getting-started',
    type: 'docs',
    url: '/docs/red-team/quickstart/',
    readTime: '5 min',
    featured: true,
  },
  {
    id: 'getting-started-guide',
    title: 'Getting Started with Promptfoo',
    description: 'Learn the basics of promptfoo: installation, configuration, and running your first evaluation.',
    category: 'getting-started',
    type: 'docs',
    url: '/docs/getting-started/',
    readTime: '10 min',
  },
  {
    id: 'llm-red-teaming-guide',
    title: 'LLM Red Teaming Guide',
    description: 'Comprehensive guide to red teaming large language models. Understand attack vectors and defense strategies.',
    category: 'getting-started',
    type: 'guide',
    url: '/docs/guides/llm-redteaming/',
    readTime: '15 min',
  },
  {
    id: 'prompt-injection-guide',
    title: 'Prompt Injection Testing',
    description: 'Learn how to test your LLM applications for prompt injection vulnerabilities using automated techniques.',
    category: 'getting-started',
    type: 'guide',
    url: '/docs/red-team/strategies/prompt-injection/',
    readTime: '10 min',
  },
  {
    id: 'jailbreak-testing',
    title: 'Jailbreak Testing',
    description: 'Test your models against known jailbreak techniques and discover new bypass methods.',
    category: 'getting-started',
    type: 'guide',
    url: '/docs/red-team/strategies/composite-jailbreaks/',
    readTime: '8 min',
  },
  {
    id: 'configuration-guide',
    title: 'Configuration Reference',
    description: 'Complete reference for promptfoo configuration options, providers, and evaluation settings.',
    category: 'getting-started',
    type: 'docs',
    url: '/docs/configuration/guide/',
    readTime: '12 min',
  },
  {
    id: 'eval-intro',
    title: 'Introduction to LLM Evaluation',
    description: 'Learn the fundamentals of evaluating LLM outputs for quality, safety, and reliability.',
    category: 'getting-started',
    type: 'guide',
    url: '/docs/intro/',
    readTime: '8 min',
  },
  {
    id: 'cli-reference',
    title: 'CLI Reference',
    description: 'Command-line interface reference for all promptfoo commands and options.',
    category: 'getting-started',
    type: 'docs',
    url: '/docs/usage/command-line/',
    readTime: '5 min',
  },

  // ===== SECURITY RESEARCH (15) =====
  {
    id: 'ai-safety-vs-security',
    title: 'AI Safety vs AI Security',
    description: "What's the difference between AI safety and AI security, and why does it matter for your applications?",
    category: 'security-research',
    type: 'blog',
    url: '/blog/ai-safety-vs-security/',
    date: '2024-10-15',
    featured: true,
  },
  {
    id: 'deepseek-censorship',
    title: 'DeepSeek Censorship Research',
    description: 'Our analysis of content filtering and censorship mechanisms in the DeepSeek language model.',
    category: 'security-research',
    type: 'blog',
    url: '/blog/deepseek-censorship/',
    date: '2025-01-15',
  },
  {
    id: 'claude-character',
    title: 'Red Teaming Claude',
    description: 'Techniques and strategies for red teaming Claude models and understanding their security properties.',
    category: 'security-research',
    type: 'blog',
    url: '/blog/red-team-claude/',
    date: '2024-09-20',
  },
  {
    id: 'foundation-model-security',
    title: 'Foundation Model Security',
    description: 'Comprehensive security analysis of foundation models including safety properties and attack resistance.',
    category: 'security-research',
    type: 'blog',
    url: '/blog/foundation-model-security/',
    date: '2024-08-10',
  },
  {
    id: 'owasp-top-10',
    title: 'OWASP Top 10 for LLMs',
    description: 'Guide to the OWASP Top 10 vulnerabilities for Large Language Model applications.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/red-team/owasp-llm-top-10/',
    readTime: '15 min',
  },
  {
    id: 'rag-security',
    title: 'RAG Security Best Practices',
    description: 'Security considerations for Retrieval-Augmented Generation systems and how to test them.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/red-team/rag/',
    readTime: '12 min',
  },
  {
    id: 'agent-security',
    title: 'AI Agent Security',
    description: 'Security challenges unique to AI agents and autonomous systems. Testing strategies and mitigations.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/red-team/agents/',
    readTime: '15 min',
  },
  {
    id: 'harmful-content',
    title: 'Harmful Content Generation',
    description: 'Testing for and preventing harmful content generation in LLM applications.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/red-team/plugins/harmful/',
    readTime: '10 min',
  },
  {
    id: 'pii-leakage',
    title: 'PII Leakage Testing',
    description: 'Detect and prevent personally identifiable information leakage from your LLM applications.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/red-team/plugins/pii/',
    readTime: '8 min',
  },
  {
    id: 'indirect-prompt-injection',
    title: 'Prompt Injection Strategies',
    description: 'Understanding and testing for prompt injection attacks including direct and indirect injection in RAG and agent systems.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/red-team/strategies/prompt-injection/',
    readTime: '12 min',
  },
  {
    id: 'model-comparison',
    title: 'Claude vs GPT Comparison',
    description: 'Detailed comparison of Claude and GPT models for evaluation, including performance and security characteristics.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/guides/claude-vs-gpt/',
    readTime: '15 min',
  },
  {
    id: 'hallucination-testing',
    title: 'Hallucination Detection',
    description: 'Techniques for detecting and measuring hallucinations in LLM outputs.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/red-team/plugins/hallucination/',
    readTime: '10 min',
  },
  {
    id: 'toxicity-testing',
    title: 'Preventing LLM Hallucinations',
    description: 'Techniques for testing and preventing LLM hallucinations and factual errors.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/guides/prevent-llm-hallucinations/',
    readTime: '8 min',
  },
  {
    id: 'custom-plugins',
    title: 'Custom Security Plugins',
    description: 'Build custom security testing plugins tailored to your specific use cases and threats.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/red-team/plugins/custom/',
    readTime: '15 min',
  },
  {
    id: 'enterprise-security',
    title: 'LLM Guardrails',
    description: 'Implementing guardrails and security controls for enterprise LLM deployments.',
    category: 'security-research',
    type: 'guide',
    url: '/docs/red-team/guardrails/',
    readTime: '12 min',
  },

  // ===== COURSES (10) =====
  {
    id: 'anthropic-prompt-evals',
    title: 'Anthropic: Prompt Evaluations',
    description: '9-lesson course on evaluating prompts for quality, safety, and effectiveness using Claude.',
    category: 'courses',
    type: 'course',
    url: 'https://github.com/anthropics/courses/tree/master/prompt_evaluations',
    isExternal: true,
    source: 'Anthropic',
    duration: '6 hours',
    featured: true,
  },
  {
    id: 'openai-safety-eval',
    title: 'OpenAI: Safety Evaluation',
    description: 'Learn OpenAI\'s approach to safety evaluation and red teaming for GPT models.',
    category: 'courses',
    type: 'course',
    url: 'https://platform.openai.com/docs/guides/safety-best-practices',
    isExternal: true,
    source: 'OpenAI',
    duration: '2 hours',
  },
  {
    id: 'aws-bedrock-tutorial',
    title: 'AWS: LLM Evaluation with Bedrock',
    description: 'Official AWS tutorial on building LLM evaluation frameworks with Amazon Bedrock and promptfoo.',
    category: 'courses',
    type: 'course',
    url: 'https://community.aws/content/2lBABEGKhWvkHe13FweHqfwqAIU/testing-llms-and-prompts-with-promptfoo',
    isExternal: true,
    source: 'AWS',
    duration: '3 hours',
  },
  {
    id: 'ibm-llm-testing',
    title: 'IBM: Responsible AI Testing',
    description: 'IBM\'s framework for responsible AI testing and evaluation of foundation models.',
    category: 'courses',
    type: 'course',
    url: 'https://www.ibm.com/docs/en/watsonx/saas?topic=models-evaluating-foundation',
    isExternal: true,
    source: 'IBM',
    duration: '4 hours',
  },
  {
    id: 'azure-responsible-ai',
    title: 'Azure: Responsible AI Dashboard',
    description: 'Microsoft\'s approach to responsible AI evaluation and monitoring in Azure ML.',
    category: 'courses',
    type: 'course',
    url: 'https://learn.microsoft.com/en-us/azure/machine-learning/concept-responsible-ai',
    isExternal: true,
    source: 'Microsoft',
    duration: '3 hours',
  },
  {
    id: 'google-genai-eval',
    title: 'Google: Gen AI Evaluation',
    description: 'Google\'s guide to evaluating generative AI models for quality and safety.',
    category: 'courses',
    type: 'course',
    url: 'https://cloud.google.com/vertex-ai/docs/generative-ai/models/evaluate-models',
    isExternal: true,
    source: 'Google Cloud',
    duration: '2 hours',
  },
  {
    id: 'nist-ai-rmf',
    title: 'NIST AI Risk Management Framework',
    description: 'The definitive framework for managing AI risks from the National Institute of Standards and Technology.',
    category: 'courses',
    type: 'course',
    url: 'https://www.nist.gov/itl/ai-risk-management-framework',
    isExternal: true,
    source: 'NIST',
    duration: '5 hours',
  },
  {
    id: 'owasp-llm-guide',
    title: 'OWASP LLM Security Guide',
    description: 'Comprehensive guide from OWASP on securing LLM applications against the top 10 threats.',
    category: 'courses',
    type: 'course',
    url: 'https://owasp.org/www-project-top-10-for-large-language-model-applications/',
    isExternal: true,
    source: 'OWASP',
    duration: '4 hours',
  },
  {
    id: 'huggingface-eval',
    title: 'Hugging Face: Model Evaluation',
    description: 'Learn to evaluate models on Hugging Face using the Evaluate library and leaderboards.',
    category: 'courses',
    type: 'course',
    url: 'https://huggingface.co/docs/evaluate',
    isExternal: true,
    source: 'Hugging Face',
    duration: '2 hours',
  },
  {
    id: 'mlflow-llm-eval',
    title: 'MLflow: LLM Evaluation',
    description: 'Track and evaluate LLM experiments using MLflow\'s integrated evaluation tools.',
    category: 'courses',
    type: 'course',
    url: 'https://mlflow.org/docs/latest/llms/llm-evaluate/index.html',
    isExternal: true,
    source: 'MLflow',
    duration: '2 hours',
  },

  // ===== COMMUNITY (12) =====
  {
    id: 'rsa-2026',
    title: 'RSA Conference 2026',
    description: 'Meet the Promptfoo team at RSA Conference 2026. Live AI red teaming demos and security consultations.',
    category: 'community',
    type: 'event',
    url: '/events/rsa-2026/',
    date: '2026-03-23',
    featured: true,
  },
  {
    id: 'bsides-sf-2026',
    title: 'BSides SF 2026',
    description: 'Join us at BSides SF 2026 for hands-on AI security workshops and community discussions.',
    category: 'community',
    type: 'event',
    url: '/events/bsides-sf-2026/',
    date: '2026-03-21',
  },
  {
    id: 'blackhat-2025',
    title: 'Black Hat USA 2025',
    description: 'Visit booth #4712 for live AI red teaming demos and security consultations.',
    category: 'community',
    type: 'event',
    url: '/events/blackhat-2025/',
    date: '2025-08-05',
  },
  {
    id: 'defcon-33',
    title: 'DEF CON 33 Party',
    description: 'Join hackers and security researchers for the AI security party of DEF CON.',
    category: 'community',
    type: 'event',
    url: '/events/defcon-2025/',
    date: '2025-08-09',
  },
  {
    id: 'github-repo',
    title: 'GitHub Repository',
    description: 'Star us on GitHub! Contribute to the open-source LLM testing framework.',
    category: 'community',
    type: 'external',
    url: 'https://github.com/promptfoo/promptfoo',
    isExternal: true,
    source: 'GitHub',
  },
  {
    id: 'discord-community',
    title: 'Discord Community',
    description: 'Join our Discord to connect with other practitioners, ask questions, and share insights.',
    category: 'community',
    type: 'external',
    url: 'https://discord.gg/gHPS9jjfbs',
    isExternal: true,
    source: 'Discord',
  },
  {
    id: 'press-coverage',
    title: 'Press & Media',
    description: 'Read about Promptfoo in the news. Media coverage and press releases.',
    category: 'community',
    type: 'docs',
    url: '/press/',
  },
  {
    id: 'company-about',
    title: 'About Promptfoo',
    description: 'Learn about our mission to make AI applications secure and reliable.',
    category: 'community',
    type: 'docs',
    url: '/about/',
  },
  {
    id: 'changelog',
    title: 'Releases',
    description: 'See what\'s new in Promptfoo. Latest features, improvements, and fixes.',
    category: 'community',
    type: 'docs',
    url: '/docs/releases/',
  },
  {
    id: 'blog-main',
    title: 'Blog',
    description: 'Technical articles, research findings, and product updates from the Promptfoo team.',
    category: 'community',
    type: 'blog',
    url: '/blog/',
  },
  {
    id: 'careers',
    title: 'Careers',
    description: 'Join our team! We\'re hiring engineers, researchers, and security experts.',
    category: 'community',
    type: 'docs',
    url: '/careers/',
  },
  {
    id: 'contact',
    title: 'Contact Us',
    description: 'Get in touch with our team for enterprise inquiries, partnerships, or support.',
    category: 'community',
    type: 'docs',
    url: '/contact/',
  },
];

// Filter and sort helpers
export function getResourcesByCategory(category: ResourceCategory): Resource[] {
  return resources.filter((r) => r.category === category);
}

export function getFeaturedResources(): Resource[] {
  return resources.filter((r) => r.featured);
}

export function searchResources(query: string): Resource[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) {
    return resources;
  }

  return resources.filter(
    (r) =>
      r.title.toLowerCase().includes(lowerQuery) ||
      r.description.toLowerCase().includes(lowerQuery),
  );
}

export function filterResources(
  category: ResourceCategory | 'all',
  searchQuery: string,
): Resource[] {
  let result = resources;

  if (category !== 'all') {
    result = result.filter((r) => r.category === category);
  }

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    result = result.filter(
      (r) =>
        r.title.toLowerCase().includes(query) || r.description.toLowerCase().includes(query),
    );
  }

  return result;
}

export function getCategoryCounts(): Record<ResourceCategory | 'all', number> {
  return {
    all: resources.length,
    'getting-started': resources.filter((r) => r.category === 'getting-started').length,
    'security-research': resources.filter((r) => r.category === 'security-research').length,
    courses: resources.filter((r) => r.category === 'courses').length,
    community: resources.filter((r) => r.category === 'community').length,
  };
}
