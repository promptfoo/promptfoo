import React from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import dedent from 'dedent';
import styles from '../styles.module.css';

const faqs = [
  {
    question: `What's the difference between Promptfoo Open Source and Promptfoo Enterprise?`,
    answer: dedent`
      Promptfoo Open Source is a free, open-source version of our platform that focuses specifically on local testing and one-off scans.

      Promptfoo Enterprise is our commercial version that offers additional capabilities such as team collaboration, continuous monitoring, a centralized security dashboard, customized plugins, SSO, access control, cloud deployment options, and priority support with SLA guarantees.
    `,
  },
  {
    question: `How does Promptfoo differ from other LLM security tools?`,
    answer: dedent`
      Promptfoo is the only LLM security tool that includes the following:

      - Dynamic test sets that are unique to your application.
      - ML search & optimization algorithms that explore the state space of your application to find novel vulnerabilities.
      - 30+ configurable plugins, including advanced attack types like conversational jailbreaks and indirect prompt injections.
      - A focus on testing the security of applications rather than base models.
      - Support for both black-box and gray-box applications.
      - No SDK or agent requirements.
    `,
  },
  {
    question: 'What types of LLM vulnerabilities can Promptfoo detect?',
    answer: dedent`
      Promptfoo covers a wide range of vulnerabilities. This includes:

      - Prompt injections
      - Jailbreaks
      - Insecure output handling
      - Data poisoning
      - Sensitive information/PII disclosure
      - Insecure plugin design
      - Excessive agency
      - Overreliance
    `,
  },
  {
    question: 'How does Promptfoo integrate with existing development workflows?',
    answer: dedent`
      Promptfoo integrates with common CI/CD pipelines, allowing for continuous vulnerability detection throughout the development lifecycle. It offers:

      - Support for popular CI/CD platforms
      - Configurable scans on code changes, pull requests, or scheduled intervals
      - Flexibility to run locally or self-hosted
    `,
  },
  {
    question: 'What deployment options are available for Promptfoo?',
    answer: dedent`
      Promptfoo offers both cloud-based and on-premises solutions. The on-premises option provides complete data isolation and control over your infrastructure.
    `,
  },
];

function convertMarkdownToHtml(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>').replace(/\n/g, '<br />');
}

export default function FAQ(): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.faqSection}`}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
        <div className={styles.faqList}>
          {faqs.map((faq, index) => (
            <details key={index} className={styles.faqItem}>
              <summary className={styles.faqQuestion}>
                {faq.question}
                <ExpandMoreIcon className={styles.faqIcon} />
              </summary>
              <div
                className={styles.faqAnswer}
                dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(faq.answer) }}
              />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
