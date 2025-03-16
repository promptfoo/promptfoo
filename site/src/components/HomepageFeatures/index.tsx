import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export default function HomepageFeatures() {
  const features = [
    {
      title: 'Comprehensive security coverage',
      description:
        'Custom probes for your application that identify failures you actually care about, not just generic jailbreaks and prompt injections.',
      image: '/img/security-coverage.png',
      image2x: '/img/security-coverage.png',
      alt: 'promptfoo security coverage examples',
      link: '/docs/red-team/llm-vulnerability-types/',
      cta: 'Learn More',
    },
    {
      title: 'Built for developers',
      description:
        'Move quickly with a command-line interface, live reloads, and caching. No SDKs, cloud dependencies, or logins.',
      image:
        'https://user-images.githubusercontent.com/310310/244891726-480e1114-d049-40b9-bd5f-f81c15060284.gif',
      image2x:
        'https://user-images.githubusercontent.com/310310/244891726-480e1114-d049-40b9-bd5f-f81c15060284.gif',
      alt: 'promptfoo CLI',
      link: '/docs/getting-started',
      cta: 'Get Started',
    },
    {
      title: 'Battle-tested open-source',
      description:
        'Used by teams serving millions of users and supported by an active open-source community.',
      image: '/img/github-repo.png',
      image2x: '/img/github-repo.png',
      alt: 'promptfoo github repo',
      link: 'https://github.com/promptfoo/promptfoo',
      cta: 'View on GitHub',
    },
  ];

  return (
    <section className={styles.features}>
      <div className="container">
        {/*<h2 className={styles.featuresTitle}>Why Promptfoo?</h2>*/}
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
