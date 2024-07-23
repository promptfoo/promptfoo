import React from 'react';
import Layout from '@theme/Layout';
import styles from './careers.module.css';

export default function Careers(): JSX.Element {
  return (
    <Layout title="Careers at Promptfoo" description="Shape the future of LLM Security">
      <main className={styles.careersContainer}>
        <h1>Join Promptfoo</h1>
        <p>
          Our mission is to create a more transparent and secure AI ecosystem by developing
          open-source tools that empower teams to build safe, reliable LLM applications.
        </p>
        <p>
          We are building sophisticated generative AI evaluation tools for secure and ethical AI
          applications. Our core products are an open-source evaluation framework used by over
          25,000 developers, and advanced red teaming solutions to ensure AI systems are robust and
          secure. We believe in the power of open-source and are committed to putting developers
          first. Our tools are already making a significant impact in various real-world
          applications, enhancing the reliability and security of AI systems.
        </p>

        <h2>Our Values</h2>
        <ul>
          <li>We believe the future of AI is open source.</li>
          <li>We are committed to building secure and reliable tools for ethical AI.</li>
          <li>We build solutions for real-world applications powered by GenAI.</li>
        </ul>

        <h2>The Ideal Promptfoo Contributor</h2>
        <p>We're building a small, passionate team of individuals who:</p>
        <ul>
          <li>Are strong generalists with a broad technical aptitude</li>
          <li>Thrive in a self-driven, distributed team environment</li>
          <li>Are passionate about LLMs and their applications</li>
          <li>Embrace open-source principles and community contribution</li>
          <li>Have a passion for building developer tools</li>
          <li>Have experience in red teaming or are interested in developing secure AI systems</li>
        </ul>

        <h2>How to Join Us</h2>
        <p>
          We are looking for talented individuals with skills in Software Engineering, AI Research,
          Technical Writing, and Developer Advocacy. If you're excited about our work, please reach
          out to us at: <a href="mailto:careers@promptfoo.dev">careers@promptfoo.dev</a>.
        </p>
        <p>
          Promptfoo is an equal opportunity employer committed to creating an inclusive environment
          for all employees.
        </p>
      </main>
    </Layout>
  );
}
