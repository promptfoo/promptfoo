import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export default function HomepageFeatures() {
  const features = [
    {
      title: 'Tailored to your systems',
      description: (
        <>
          <p>
            Our specialized language models find vulnerabilities in 50+ risk areas, including in
            complex RAGs and agents.
          </p>
          <p>No canned attacks - every attack is tailored to your system.</p>
        </>
      ),
      image: '/img/security-coverage.png',
      image2x: '/img/security-coverage.png',
      alt: 'promptfoo security coverage examples',
      link: '/docs/red-team/llm-vulnerability-types/',
      cta: 'Learn More',
    },
    {
      title: 'The most widely adopted security stack',
      description: (
        <>
          <p>
            Battle-tested at large enterprises, with a thriving open source community of security
            experts.
          </p>
          <p>Promptfoo has been used by 75,000+ users, ranging from startups to Fortune 50s.</p>
        </>
      ),
      image: '/img/github-repo.png',
      image2x: '/img/github-repo.png',
      alt: 'promptfoo quickstart',
      link: '/docs/red-team/quickstart/',
      cta: 'Get Started',
    },
    {
      title: 'Set your standards',
      description: (
        <>
          <p>Map to OWASP, NIST, MITRE, EU AI Act, and more.</p>
          <p>
            Customizable to your specific policies and industry regulations, with detailed
            reporting.
          </p>
        </>
      ),
      image: '/img/compliance-frameworks.png',
      image2x: '/img/compliance-frameworks.png',
      alt: 'promptfoo compliance reporting',
      link: '/red-teaming/',
      cta: 'Learn More',
    },
    {
      title: 'Deploy your way',
      description:
        'Get started in minutes with our CLI tool, or choose our managed cloud or on-premises enterprise solutions for advanced features and support.',
      image: '/img/deploy-options.svg',
      image2x: '/img/deploy-options.svg',
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
