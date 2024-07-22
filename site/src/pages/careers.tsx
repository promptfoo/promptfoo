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
        <h2>Open-Source and Developer-First GenAI Tools</h2>

        <p>
          Our open-source LLM evaluation tool is loved by application developers everywhere. We empower 
          teams and companies to develop safe, reliable LLM applications through our evaluation tools and automated red-teaming.
          Join us in our mission to create a more reliable and transparent AI ecosystem.
        </p>

        <h2>Why Work at Promptfoo?</h2>
        <p>Of the developers, for the developers, by the developers - and with the developers everywhere.</p>
        <ul>
          <li>We are open-source. We believe the future of AI is open-source.</li>
          <li>We put developers first.</li>
          <li>We are committed to building secure and reliable tools for ethical AI.</li>
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
            <strong>Openness:</strong> We foster open communication and knowledge sharing in our products and team culture.
          </li>
          <li>
            <strong>Collaboration:</strong> We believe in horizontal teams where every voice matters.
          </li>
          <li>
            <strong>Innovation:</strong> We continuously push the boundaries of what's possible in AI development.
          </li>
          <li>
            <strong>Responsibility:</strong> We're committed to safe, ethical, and effective Gen AI development.
          </li>
        </ul>

        <h2>What We're Working On</h2>
        <p>Our team is deeply involved in key aspects of LLM developer workflows:</p>
        <ul>
          <li>Advanced prompt engineering techniques</li>
          <li>Sophisticated Gen AI testing and evaluation tools</li>
          <li>Open-source LLM libraries and frameworks</li>
          <li>LLM security and AI ethics solutions</li>
        </ul>

        <h2>Our Team</h2>
        <p>
          We're a small, dedicated group of innovators passionate about open source and advancing LLM technology. 
          Our collaborative environment fosters creativity and excellence, driving us to push the boundaries of what's possible.
        </p>

        <h2>The Ideal Promptfoo Contributor</h2>
        <p>We're looking for individuals who:</p>
        <ul>
          <li>Are deeply passionate about LLMs and their applications</li>
          <li>Embrace open-source principles and community contribution</li>
          <li>Excel at problem-solving and demonstrate strong technical aptitude</li>
          <li>Thrive in a self-driven, distributed team environment</li>
          <li>Adapt quickly to the evolving landscape of AI technology</li>
        </ul>

        <h2>Benefits</h2>
        <ul>
          <li>Flexible, remote-first work environment</li>
          <li>Opportunity to work on cutting-edge AI technology</li>
          <li>Collaborative and inclusive team culture</li>
          <li>Professional development and learning opportunities</li>
          <li>Competitive compensation and equity options</li>
        </ul>

        <h2>Open Positions</h2>
        <p>
          We're always looking for talented individuals to join our team. Current areas of focus include:
        </p>
        <ul>
          <li>Software Engineering (Backend and Frontend)</li>
          <li>AI Research</li>
          <li>Technical Writing</li>
          <li>Developer Advocacy</li>
        </ul>
        <p>Don't see your exact role? We're open to exploring how your unique skills can contribute to our mission.</p>

        <h2>How to Join Us</h2>
        <p>
          If you're excited about the work we're doing and want to contribute, please reach out to us at:
          <a href="mailto:careers@promptfoo.dev">careers@promptfoo.dev</a>
        </p>
        <p>We want to hear about:</p>
        <ul>
          <li>Problems you solved using LLMs and Gen AI.</li>
          <li>Challenges you encountered therein.</li>
          <li>Any open source projects you've contributed to or personal projects you're proud of.</li>
          <li>Your thoughts on PromptFoo and how you would contribute to our mission.</li>
        </ul>
        <p>Send your resume and thoughts to <a href="mailto:careers@promptfoo.dev">careers@promptfoo.dev</a>. We'll review your application and reach out to discuss next steps.</p>

        <p>
          We're excited to learn about your unique perspective and explore how we can advance 
          LLM technology together, creating tools that benefit the entire AI community.
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
