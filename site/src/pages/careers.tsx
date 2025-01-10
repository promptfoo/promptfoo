import React from 'react';
import Layout from '@theme/Layout';
import styles from './careers.module.css';

export default function Careers(): JSX.Element {
  return (
    <Layout title="Careers at Promptfoo" description="Shape the future of LLM Security">
      <main className={styles.careersContainer}>
        <h1>Careers at Promptfoo</h1>
        <p>Our mission is to help developers ship secure and reliable AI apps.</p>
        <p>
          Our core product is an open-source pentesting and evaluation framework used by tens of
          thousands of developers. Promptfoo is among the most popular evaluation frameworks and is
          the first product to adapt AI-specific pentesting techniques to your application.
        </p>
        <p>
          We're betting that the future of AI is open-source and are deeply committed to our
          developer community and our{' '}
          <a href="https://github.com/promptfoo/promptfoo">open-source</a> offering.
        </p>

        <h2>We're hiring!</h2>
        <p>
          We are executing on the above with a small team of extremely talented and motivated
          people.
        </p>
        <p>We are currently hiring:</p>
        <ul>
          <li>Founding Account Executive</li>
          <li>Founding Developer Relations</li>
          <li>Senior Software Engineers</li>
        </ul>
        <p>
          If you're a self-driven generalist who can build and ship quickly, aggressively
          prioritize, and has a passion for security, developer tools, and AI, please get in touch!
        </p>
        <p>
          If you're interested in exploring opportunities, please reach out to{' '}
          <a href="mailto:careers@promptfoo.dev">careers@promptfoo.dev</a>. Include a link to your
          LinkedIn or GitHub profile in your email. We carefully review all applications. We will
          give preference to applicants who have already made contributions to promptfoo.
        </p>
      </main>
    </Layout>
  );
}
