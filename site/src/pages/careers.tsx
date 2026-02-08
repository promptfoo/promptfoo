import React, { useEffect } from 'react';

import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './careers.module.css';

export default function Careers(): React.ReactElement {
  const { siteConfig } = useDocusaurusContext();
  const siteUrl = siteConfig.url;

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://jobs.ashbyhq.com/promptfoo/embed';
    script.async = true;

    document.body.appendChild(script);
  }, []);

  return (
    <Layout
      title="Careers at Promptfoo"
      description="Join the team securing AI for the Fortune 500. We're hiring engineers who want to solve hard problems in AI security."
    >
      <Head>
        <meta
          property="og:title"
          content="Careers at Promptfoo - Build the Future of AI Security"
        />
        <meta
          property="og:description"
          content="Join the team securing AI for the Fortune 500. We're hiring engineers who want to solve hard problems in AI security."
        />
        <meta property="og:image" content={`${siteUrl}/img/og/careers-og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${siteUrl}/careers`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Careers at Promptfoo - Build the Future of AI Security"
        />
        <meta
          name="twitter:description"
          content="Join the team securing AI for the Fortune 500. We're hiring engineers who want to solve hard problems in AI security."
        />
        <meta name="twitter:image" content={`${siteUrl}/img/og/careers-og.png`} />
        <link rel="canonical" href={`${siteUrl}/careers`} />
      </Head>
      <h1 className={styles.careersTitle}>Careers at Promptfoo</h1>
      <div id="ashby_embed" />
    </Layout>
  );
}
