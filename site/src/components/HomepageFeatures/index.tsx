import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export default function HomepageFeatures() {
  const features = [
    {
      title: 'Find vulnerabilities you actually care about',
      description: (
        <>
          <p>
            Our <strong>specialized language models</strong> generate attacks specific to your
            industry, company, and application.
          </p>
          <p>No generic canned attacks - every attack is created on-the-fly.</p>
        </>
      ),
      image: '/img/security-coverage.png',
      image2x: '/img/security-coverage.png',
      alt: 'promptfoo security coverage examples',
      link: '/docs/red-team/llm-vulnerability-types/',
      cta: 'Learn More',
    },
    {
      title: 'Battle-tested at enterprise scale',
      description: (
        <>
          <p>
            Adopted by <strong>27 Fortune 500 companies</strong> shipping apps to hundreds of
            millions of users.
          </p>
          <p>
            Embraced by an open-source community of <strong>over 100,000 developers</strong>{' '}
            worldwide.
          </p>
        </>
      ),
      image: '/img/f500-usage.svg',
      image2x: '/img/f500-usage.svg',
      alt: 'promptfoo quickstart',
      link: '/docs/red-team/quickstart/',
      cta: 'Get Started',
      className: 'f500',
    },
    /*
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
    */
    {
      title: 'Security-first, developer-friendly',
      image:
        'https://user-images.githubusercontent.com/310310/244891726-480e1114-d049-40b9-bd5f-f81c15060284.gif',
      image2x:
        'https://user-images.githubusercontent.com/310310/244891726-480e1114-d049-40b9-bd5f-f81c15060284.gif',
      description:
        'Move quickly with a command-line interface, live reloads, and caching. No SDKs, cloud dependencies, or logins.',
      link: '/docs/red-team/quickstart/',
      cta: 'Get Started',
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
      className: 'noBorder',
    },
  ];

  return (
    <section className={styles.features}>
      <div className="container">
        <h2 className={styles.featuresTitle}>Why Promptfoo?</h2>
        <div className={styles.featuresList}>
          {features.map((feature, idx) => (
            <div
              key={idx}
              className={`${styles.featureItem} ${feature.className ? styles[feature.className] : ''}`}
            >
              <div className={styles.featureContent}>
                <h3>{feature.title}</h3>
                <div>{feature.description}</div>
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
                    className={`${styles.featureImage} ${feature.className ? styles[feature.className + 'Image'] : ''}`}
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
