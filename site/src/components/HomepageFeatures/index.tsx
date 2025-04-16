import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export default function HomepageFeatures() {
  const features = [
    {
      title: 'Comprehensive coverage',
      description:
        'Full-stack security for AI applications: red teaming, guardrails, model security, and continuous evaluation of your entire AI ecosystem.',
      image: '/img/security-coverage.png',
      image2x: '/img/security-coverage.png',
      alt: 'promptfoo security coverage examples',
      link: '/docs/red-team/llm-vulnerability-types/',
      cta: 'Learn More',
    },
    {
      title: 'The most widely adopted AI security solution',
      description:
        'Battle-tested at large enterprises, with a thriving open source community of security experts.',
      image: '/img/github-repo.png',
      image2x: '/img/github-repo.png',
      alt: 'promptfoo github repository',
      link: 'https://github.com/promptfoo/promptfoo',
      cta: 'View on GitHub',
    },
    {
      title: 'Compliance framework integration',
      description:
        "Mapped to OWASP, NIST, MITRE, EU AI Act, and more. Customizable to your organization's specific policies and industry regulations, with detailed compliance reporting.",
      image: '/img/report-with-compliance@2x.png',
      alt: 'promptfoo compliance reporting',
      link: '/model-security/',
      cta: 'Learn More',
    },
    {
      title: 'Deploy your way',
      description:
        'Get started in minutes with our CLI tool (free), or choose our managed cloud or on-premises enterprise solutions for advanced features and support.',
      image: '/img/redteamrun-cli.png',
      alt: 'promptfoo deployment options',
      link: '/contact/',
      cta: 'Get Started',
    },
  ];

  return (
    <section className={styles.features}>
      <div className="container">
        <h2 className={styles.featuresTitle}>Why Promptfoo?</h2>
        <div className={styles.featuresList}>
          {features.map((feature, idx) => (
            <div key={idx} className={styles.featureItem}>
              <div className={styles.featureContent}>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <Link to={feature.link} className="button button--secondary">
                  {feature.cta}
                </Link>
              </div>
              <div className={styles.featureImageWrapper}>
                <Link to={feature.link}>
                  <img
                    loading="lazy"
                    src={feature.image}
                    srcSet={`${feature.image} 1x, ${feature.image2x} 2x`}
                    alt={feature.alt}
                    className={styles.featureImage}
                  />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
