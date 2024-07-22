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
          PromptFoo is set to be the go-to platform for developers to iterate on LLM and Gen AI applications. 
          Our open-source evaluation tool is widely adopted for prompt engineering and LLM evaluations, 
          helping companies and individuals harness the full potential of AI. Our mission is to empower 
          developers and businesses with robust tools for optimizing LLM development, testing and evaluating 
          Gen AI applications, and fostering a more reliable and transparent AI ecosystem.
        </p>

        <h2>Why Work with Us?</h2>
        <p>Of the developers, for the developers, by the developers–And with the developers everywhere.</p>
        <ul>
          <li>We are open-source at heart.</li>
          <li>We put developers first.</li>
          <li>We are pioneering the riskiest rocks in LLM development.</li>
        </ul>

        <h3>Join our mission.</h3>
        <p>
          We are committed to bringing to the world a responsible, safe, and effective LLM development framework. 
          You will make a meaningful impact at this crucial inflection point in technology and society.
        </p>

        <h3>...with your contribution!</h3>
        <p>
          We believe in diverse perspectives and horizontal team collaboration. It brings the most for the team, 
          product, and the developer ecosystem. You will be a crucial member of the team from Day 1.
        </p>
        <p>You can work from anywhere, anytime.</p>

        <h2>Our Values</h2>
        <ul>
          <li>
            <strong>Open-source:</strong> We believe in open communication and sharing knowledge–both in product and team cultures.
          </li>
          <li>
            <strong>Bottom-up:</strong> We believe in horizontal teams where everyone's voices make a meaningful impact.
          </li>
          <li>
            <strong>Developer-first:</strong> We are committed to putting developer experience as the first and foremost top priority–everything else follows.
          </li>
          <li>
            <strong>Biggest-rock:</strong> We tackle the hardest, most challenging problems in safe, responsible, effective Gen AI development.
          </li>
        </ul>

        <h2>Our Focus Areas</h2>
        <p>We're deeply involved in several key aspects of LLM developer workflows and ecosystem:</p>
        <ul>
          <li>
            <strong>Prompt Engineering:</strong> Develop innovative methods to optimize prompt performance for diverse LLM applications.
          </li>
          <li>
            <strong>Gen AI Testing and Evaluation:</strong> Create sophisticated tools for rigorous testing of LLM outputs and behaviors.
          </li>
          <li>
            <strong>Open Source LLM Tools:</strong> Build and maintain open source libraries that empower the wider AI community.
          </li>
          <li>
            <strong>LLM Security and AI Ethics:</strong> Work on solutions to identify and mitigate potential risks in LLM deployments.
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
          We want to hear from you! If our missions, values, and problems sound good to you, 
          we want to discuss how we might work together in the following areas:
        </p>
        <ul>
          <li>Software Engineering (Backend and Frontend)</li>
          <li>AI Research</li>
          <li>Technical Writing</li>
          <li>Developer Advocacy</li>
          <li>...and Other Areas we don't yet know</li>
        </ul>

        <h2>How to Join Us</h2>
        <p>
          If you're excited about the work we're doing and want to contribute, please reach out to us at:{' '}
          <a href="mailto:careers@promptfoo.dev">careers@promptfoo.dev</a>
        </p>

        <p>We want to hear about...</p>
        <ul>
          <li>Problems you solved using LLMs and Gen AI.</li>
          <li>Challenges you encountered therein.</li>
          <li>Any open source projects you've contributed to or personal projects you're proud of.</li>
          <li>Your thoughts on PromptFoo and how you would contribute to our mission.</li>
        </ul>

        <p>
          We look forward to hearing from you and exploring how we can work together to advance the field of 
          LLM technology and create tools that benefit the entire AI community.
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
