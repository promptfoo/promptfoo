import React, { useEffect } from 'react';
import Layout from '@theme/Layout';
import styles from './careers.module.css';

export default function Careers(): JSX.Element {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://jobs.ashbyhq.com/promptfoo/embed';
    script.async = true;

    document.body.appendChild(script);
  }, []);

  return (
    <Layout title="Careers at Promptfoo" description="Shape the future of LLM Security">
      <main className={styles.careersContainer}>
        <h1>Careers at Promptfoo</h1>
        <p>Our mission is to help developers ship secure and reliable AI apps.</p>
        <p>
          Our core product is an open-source pentesting and evaluation framework used by 80,000+
          developers. Promptfoo is among the most popular evaluation frameworks and is the first
          product to adapt AI-specific pentesting techniques to your application.
        </p>
        <p>
          We're betting that the future of AI is open-source and are deeply committed to our
          developer community and our{' '}
          <a href="https://github.com/promptfoo/promptfoo">open-source</a> offering.
        </p>
      </main>
      <div id="ashby_embed" />
    </Layout>
  );
}
