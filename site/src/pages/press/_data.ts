export interface Article {
  publication: string;
  title: string;
  link: string;
}

export interface Podcast {
  title: string;
  source: string;
  date: string;
  description: string;
  link: string;
}

export interface EducationalResource {
  title: string;
  source: string;
  year: string;
  description: string;
  duration: string;
  link: string;
}

export interface TechnicalContent {
  title: string;
  source: string;
  date: string;
  description: string;
  link: string;
}

export interface Founder {
  name: string;
  title: string;
  linkedIn: string;
}

export const DEEPSEEK_COVERAGE: Article[] = [
  {
    publication: 'Ars Technica',
    title: "The questions the Chinese government doesn't want DeepSeek AI to answer",
    link: 'https://arstechnica.com/ai/2025/01/the-questions-the-chinese-government-doesnt-want-deepseek-ai-to-answer/',
  },
  {
    publication: 'TechCrunch',
    title: "DeepSeek's AI avoids answering 85% of prompts on sensitive topics related to China",
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
    publication: 'Stanford Cyber Policy Center',
    title: 'Taking Stock of the DeepSeek Shock',
    link: 'https://cyber.fsi.stanford.edu/publication/taking-stock-deepseek-shock',
  },
  {
    publication: 'The Independent',
    title: 'How DeepSeek users are forcing the AI to reveal the truth about Chinese executions',
    link: 'https://www.the-independent.com/tech/deepseek-ai-china-censorship-tiananmen-square-b2688390.html',
  },
  {
    publication: 'Washington Times',
    title: 'Inside Ring: DeepSeek toes Chinese party line',
    link: 'https://www.washingtontimes.com/news/2025/jan/29/inside-ring-deepseek-toes-chinese-party-line-xi-ta/',
  },
  {
    publication: 'MSN',
    title: 'DeepSeek AI censors most prompts on sensitive topics for China',
    link: 'https://www.msn.com/en-us/news/technology/deepseek-ai-censors-most-prompts-on-sensitive-topics-for-china/ar-AA1ycVkf',
  },
  {
    publication: 'Yahoo Finance',
    title: 'DeepSeek Users Forcing AI to Reveal Censorship',
    link: 'https://finance.yahoo.com/news/deepseek-users-forcing-ai-reveal-151950834.html',
  },
  {
    publication: 'Hacker News',
    title: 'Questions censored by DeepSeek (200+ comments)',
    link: 'https://news.ycombinator.com/item?id=42858552',
  },
];

export const FEATURED_PODCASTS: Podcast[] = [
  {
    title: 'Why Social Engineering Now Works on Machines',
    source: 'AI + a16z',
    date: 'December 2, 2025',
    description:
      'Ian Webster breaks down real-world agent risk: the "lethal trifecta" (untrusted input + sensitive data + an exfiltration channel), and how automated red teaming helps catch issues before production.',
    link: 'https://a16z.com/podcast/why-social-engineering-now-works-on-machines/',
  },
  {
    title: "Breaking AI to Fix It: Ian Webster's Journey from Discord's Clyde to Promptfoo",
    source: 'Latent Space: The AI Engineer Podcast',
    date: 'October 24, 2025',
    description:
      "Ian talks with swyx and Alessio about shipping Discord's Clyde, why Promptfoo shifted from evals to AI security, and what red teaming looks like for agents and RAG applications.",
    link: 'https://www.latent.space/p/promptfoo',
  },
  {
    title: 'The Metis List of Top AI Researchers',
    source: 'TBPN',
    date: 'July 29, 2025',
    description:
      "Ian Webster joins TBPN to discuss Promptfoo's mission and what it takes to secure LLM apps and integrations, including automated red teaming to uncover data leaks and unintended behaviors.",
    link: 'https://share.transistor.fm/s/ac30bba6',
  },
  {
    title: 'What DeepSeek Means for Cybersecurity',
    source: 'AI + a16z',
    date: 'February 28, 2025',
    description:
      "In this episode, a16z partner Joel de la Garza speaks with a trio of security experts, including Promptfoo founder Ian Webster, about the security implications of the DeepSeek reasoning model. Ian's segment focuses on vulnerabilities within DeepSeek itself, and how users can protect themselves against backdoors, jailbreaks, and censorship.",
    link: 'https://a16z.com/podcast/what-deepseek-means-for-cybersecurity/',
  },
  {
    title: 'The Future of AI Security',
    source: 'CyberBytes with Steffen Foley',
    date: 'December 5, 2024',
    description:
      "A deep dive into Ian's evolution from shipping Gen AI products as an engineer to launching a cybersecurity company, the fascinating origin of Promptfoo, and key insights on the latest AI security trends.",
    link: 'https://open.spotify.com/episode/6bdzElwFgZoBHjRrYyqHoN',
  },
  {
    title: 'Securing AI by Democratizing Red Teams',
    source: 'a16z Podcast',
    date: 'August 2, 2024',
    description:
      'a16z General Partner Anjney Midha speaks with Promptfoo founder and CEO Ian Webster about the importance of red-teaming for AI safety and security, and how bringing those capabilities to more organizations will lead to safer, more predictable generative AI applications.',
    link: 'https://a16z.com/podcast/securing-ai-by-democratizing-red-teams/',
  },
];

export const EDUCATIONAL_RESOURCES: EducationalResource[] = [
  {
    title: 'OpenAI Build Hour: Prompt Testing & Evaluation',
    source: 'OpenAI',
    year: '2024',
    description:
      'Featured in OpenAI\'s Build Hour series, where they highlight that "Promptfoo is really powerful because you can iterate on prompts, configure tests in YAML, and view everything locally... it\'s faster and more straightforward."',
    duration: '60 Minutes',
    link: 'https://vimeo.com/1023317525',
  },
  {
    title: 'Anthropic Prompt Evaluations Course',
    source: 'Anthropic',
    year: '2024',
    description:
      'A comprehensive nine-lesson course covering everything from basic evaluations to advanced model-graded techniques. Anthropic notes that "Promptfoo offers a streamlined, out-of-the-box solution that can significantly reduce the time and effort required for comprehensive prompt testing."',
    duration: '6 Hours',
    link: 'https://github.com/anthropics/courses/tree/master/prompt_evaluations',
  },
  {
    title: 'AWS Workshop Studio: Mastering LLM Evaluation',
    source: 'Amazon Web Services',
    year: '2025',
    description:
      'A comprehensive workshop designed to equip you with the knowledge and practical skills needed to effectively evaluate and improve Large Language Model (LLM) applications using Amazon Bedrock and Promptfoo. The course covers everything from basic setup to advanced evaluation techniques.',
    duration: '3 Hours',
    link: 'https://catalog.us-east-1.prod.workshops.aws/promptfoo/en-US',
  },
  {
    title: 'Move to the Best LLM Model for Your App',
    source: 'IBM Skills Network',
    year: '2024',
    description:
      'A hands-on guided project that teaches developers how to master model selection using Promptfoo. Learn to adapt to new models, handle pricing changes effectively, and perform regression testing through practical scenarios.',
    duration: '2 Hours',
    link: 'https://cognitiveclass.ai/courses/move-to-the-best-llm-model-for-your-app',
  },
];

export const TECHNICAL_CONTENT: TechnicalContent[] = [
  {
    title: 'Does your LLM thing work? (& how we use promptfoo)',
    source: 'Semgrep Engineering Blog',
    date: 'September 6, 2024',
    description:
      "A detailed blog post by Semgrep's AI team explains their approach to evaluating LLM features and why they adopted Promptfoo as part of their workflow.",
    link: 'http://semgrep.dev/blog/2024/does-your-llm-thing-work-how-we-use-promptfoo/',
  },
];

export const FOUNDERS: Founder[] = [
  {
    name: 'Ian Webster',
    title: 'CEO & Co-founder',
    linkedIn: 'https://www.linkedin.com/in/ianww/',
  },
  {
    name: "Michael D'Angelo",
    title: 'CTO & Co-founder',
    linkedIn: 'https://www.linkedin.com/in/michaelldangelo/',
  },
];

export const COMPANY_INFO = {
  founded: '2024',
  headquarters: 'San Francisco, California',
  investors: 'Insight Partners, Andreessen Horowitz, and industry leaders',
  contactEmail: 'inquiries@promptfoo.dev',
};
