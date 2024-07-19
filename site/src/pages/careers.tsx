import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './careers.module.css';

export default function Careers(): JSX.Element {
  return (
    <Layout
      title="Careers at Promptfoo"
      description="Join the Promptfoo team and shape the future of LLMs"
    >
      <main className={styles.careersContainer}>
        <h1>Join the Promptfoo Team</h1>
        <h2>Shaping the Future of LLMs</h2>

        <p>
          At Promptfoo, we're dedicated to revolutionizing the way developers interact with and
          optimize AI language models. Our open-source tool is at the forefront of prompt
          engineering, helping companies and individuals harness the full potential of AI. Our
          mission is to empower developers and businesses with robust tools for LLM testing and
          prompt engineering, fostering a more reliable and transparent AI ecosystem.
        </p>

        <h2>Why Work with Us?</h2>
        <ul>
          <li>
            <strong>Open Source at Heart:</strong> Contribute to and help grow our open source
            projects, making a lasting impact on the LLM community.
          </li>
          <li>
            <strong>LLM Innovation:</strong> Be at the forefront of LLM development, working on
            challenges that push the boundaries of what's possible.
          </li>
          <li>
            <strong>Collaborative Spirit:</strong> Join a team that values diverse perspectives and
            believes in the power of collective intelligence.
          </li>
          <li>
            <strong>Continuous Learning:</strong> Grow your skills in a rapidly evolving field, with
            opportunities to explore new ideas and technologies.
          </li>
          <li>
            <strong>Meaningful Impact:</strong> Develop tools and solutions that help ensure LLMs
            are used responsibly and effectively across industries.
          </li>
          <li>
            <strong>Remote-First Culture:</strong> Work from anywhere, anytime.
          </li>
        </ul>

        <h2>Our Values</h2>
        <ul>
          <li>
            <strong>Transparency:</strong> We believe in open communication and sharing knowledge.
          </li>
          <li>
            <strong>Collaboration:</strong> We thrive on teamwork and diverse perspectives.
          </li>
          <li>
            <strong>User-Centric:</strong> Our users' needs drive our innovation.
          </li>
          <li>
            <strong>Excellence:</strong> We strive for the highest quality in everything we do.
          </li>
        </ul>

        <h2>Our Focus Areas</h2>
        <p>We're deeply involved in several key aspects of LLM technology:</p>
        <ul>
          <li>
            <strong>Prompt Engineering:</strong> Develop innovative methods to optimize prompt
            performance for diverse LLM applications.
          </li>
          <li>
            <strong>LLM Testing and Evaluation:</strong> Create sophisticated tools for rigorous
            testing of LLM outputs and behaviors.
          </li>
          <li>
            <strong>Open Source LLM Tools:</strong> Build and maintain open source libraries that
            empower the wider AI community.
          </li>
          <li>
            <strong>LLM Security and Ethics:</strong> Work on solutions to identify and mitigate
            potential risks in LLM deployments.
          </li>
        </ul>

        <h2>Our Team</h2>
        <p>
          We are a small, dedicated group of individual contributors (ICs) who are passionate about
          open source and committed to advancing LLM technology. We value collaboration, creativity,
          and a shared commitment to excellence.
        </p>

        <h2>The Ideal Contributor</h2>
        <p>We're looking for talented individuals who:</p>
        <ul>
          <li>
            Have a deep interest in and understanding of LLMs and their potential applications
          </li>
          <li>
            Are committed to open source principles and contributing to the wider AI community
          </li>
          <li>Demonstrate strong problem-solving skills and technical aptitude</li>
          <li>Are self-motivated and can work effectively in a distributed team environment</li>
          <li>
            Show versatility in adapting to new challenges in the rapidly evolving field of AI
          </li>
          <li>Have experience with or a strong desire to work on LLM-related projects</li>
        </ul>

        <h2>Open Positions</h2>
        <p>
          While we don't have specific job titles listed, we're always interested in talking to
          talented individuals who align with our mission and values. Some areas where we often need
          expertise include:
        </p>
        <ul>
          <li>Software Engineering (Backend and Frontend)</li>
          <li>AI Research</li>
          <li>Technical Writing</li>
          <li>Developer Advocacy</li>
        </ul>

        <h2>How to Join Us</h2>
        <p>
          If you're excited about the work we're doing and want to contribute, we encourage you to
          reach out. Send your resume and a brief introduction to{' '}
          <a href="mailto:careers@promptfoo.dev">careers@promptfoo.dev</a>.
        </p>
        <p>In your message:</p>
        <ul>
          <li>Tell us about your experience with LLMs or related technologies</li>
          <li>
            Share any open source projects you've contributed to or personal projects you're proud
            of
          </li>
          <li>
            Explain why you're interested in Promptfoo and how you think you can contribute to our
            mission
          </li>
        </ul>
        <p>
          We look forward to hearing from you and exploring how we can work together to advance the
          field of LLM technology and create tools that benefit the entire AI community.
        </p>

        <p>
          Promptfoo is an equal opportunity employer. We celebrate diversity and are committed to
          creating an inclusive environment for all employees.
        </p>

        <div className={styles.ctaSection}>
          <Link className="button button--primary button--lg" to="mailto:careers@promptfoo.dev">
            Apply Now
          </Link>
        </div>
      </main>
    </Layout>
  );
}
