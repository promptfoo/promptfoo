import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export default function HomepageFeatures() {
  const features = [
    {
      title: 'Simple, declarative test cases',
      description:
        'Define evaluations without code. Easily share and collaborate with built-in functionality and web viewer.',
      image: '/img/yaml-example.png',
      alt: 'Declarative Test Cases',
      link: '/docs/getting-started',
    },
    {
      title: 'Comprehensive security coverage',
      description:
        'Custom probes for your application cover failure modes you actually care about, not just generic jailbreaks and prompt injections.',
      image: '/img/riskreport-2.png',
      alt: 'Security Coverage',
      link: '/docs/red-team',
    },
    {
      title: 'Developer-friendly & Open-source',
      description:
        'Built for iteration speed with a command-line interface, live reloads, and caching. Battle-tested by teams serving millions of users and supported by an open-source community.',
      image:
        'https://user-images.githubusercontent.com/310310/244891726-480e1114-d049-40b9-bd5f-f81c15060284.gif',
      alt: 'Developer Friendly',
      link: '/docs/intro',
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
                  Learn More
                </Link>
              </div>
              <div className={styles.featureImageWrapper}>
                <Link to={feature.link}>
                  <img src={feature.image} alt={feature.alt} className={styles.featureImage} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
