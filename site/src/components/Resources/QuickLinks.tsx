import Link from '@docusaurus/Link';
import type React from 'react';
import styles from './QuickLinks.module.css';

interface QuickLink {
  icon: string;
  title: string;
  description: string;
  url: string;
  ctaText: string;
  isExternal?: boolean;
}

const QUICK_LINKS: QuickLink[] = [
  {
    icon: '\u{1F4DA}',
    title: 'Full Documentation',
    description: 'Browse all docs, guides, and API references.',
    url: '/docs/intro/',
    ctaText: 'Browse docs',
  },
  {
    icon: '\u{1F52C}',
    title: 'Foundation Model Security',
    description: 'Security analysis and red teaming of foundation models.',
    url: '/docs/red-team/foundation-models/',
    ctaText: 'View analysis',
  },
  {
    icon: '\u{1F6E1}\u{FE0F}',
    title: 'LLM Vulnerability Database',
    description: 'Browse known LLM vulnerabilities.',
    url: 'https://www.llmvulnerabilities.com/',
    ctaText: 'Explore database',
    isExternal: true,
  },
];

export default function QuickLinks(): React.ReactElement {
  return (
    <section className={styles.quickLinks} aria-labelledby="quick-links-title">
      <h2 id="quick-links-title" className={styles.title}>
        Looking for something specific?
      </h2>

      <div className={styles.grid}>
        {QUICK_LINKS.map((link) => {
          const content = (
            <>
              <span className={styles.icon} role="img" aria-hidden="true">
                {link.icon}
              </span>
              <h3 className={styles.linkTitle}>{link.title}</h3>
              <p className={styles.linkDescription}>{link.description}</p>
              <span className={styles.cta}>
                {link.ctaText}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </span>
            </>
          );

          if (link.isExternal) {
            return (
              <a
                key={link.title}
                href={link.url}
                className={styles.card}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.title} (opens in new tab)`}
              >
                {content}
              </a>
            );
          }

          return (
            <Link key={link.title} to={link.url} className={styles.card}>
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
