import React from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import dedent from 'dedent';
import styles from '../styles.module.css';

const faqs = [
  {
    question: 'What types of LLM vulnerabilities can Promptfoo detect?',
    answer: dedent`
      Promptfoo covers a wide range of vulnerabilities, including those outlined in the OWASP LLM Top 10. This includes:

      - Prompt injections
      - Insecure output handling
      - Data poisoning
      - Model denial of service
      - Supply chain vulnerabilities
      - Sensitive information disclosure
      - Insecure plugin design
      - Excessive agency
      - Overreliance
      - Model theft

      Our 30+ configurable plugins also address specific issues like PII exposure, jailbreaks, and reputational threats such as toxicity and hate speech.

      For a comprehensive list, see our [LLM vulnerability types guide](/docs/red-team/llm-vulnerability-types/).
    `,
  },
  {
    question: 'How does Promptfoo integrate with existing development workflows?',
    answer: dedent`
      Promptfoo seamlessly integrates with CI/CD pipelines, allowing for continuous vulnerability detection throughout the development lifecycle. It offers:

      - Support for popular CI/CD platforms
      - Configurable scans on code changes, pull requests, or scheduled intervals
      - Flexibility to run locally or self-hosted

      Learn more about our [CI/CD integration](/docs/integrations/ci-cd/).
    `,
  },
  {
    question: 'What deployment options are available for Promptfoo?',
    answer: dedent`
      Promptfoo offers flexible deployment options. The Community version can be run locally or self-hosted on your own infrastructure.

      For Enterprise customers, we offer both cloud-based and on-premises solutions. The on-premises option provides complete data isolation and control over your infrastructure.

      For more details, see our [deployment documentation](/docs/getting-started/).
    `,
  },
  {
    question: 'How does Promptfoo ensure compliance with industry standards?',
    answer: dedent`
      Promptfoo aligns with key industry frameworks including OWASP, NIST, MITRE, and EU AI standards. Our scans and recommendations are designed to help organizations meet these compliance requirements.

      The platform provides detailed reporting and analytics to track compliance status across your LLM applications.

      For OWASP compliance specifically, refer to our [OWASP LLM Top 10 guide](/docs/red-team/owasp-llm-top-10/).
    `,
  },
  {
    question: 'Can Promptfoo be customized for specific organizational needs?',
    answer: dedent`
      Yes, Promptfoo is highly customizable. You can select specific attack types and frameworks to focus on, and add organization-specific requirements and alerting.

      The Enterprise version allows for custom plugin development to address unique security concerns in your LLM applications.

      For configuration options, see our [configuration guide](/docs/configuration/).
    `,
  },
  {
    question: 'What is the difference between the Community and Enterprise versions?',
    answer: dedent`
      The Community version is free and open-source, providing core features for local testing, evaluation, and vulnerability scanning.

      The Enterprise version offers additional capabilities such as team collaboration, continuous monitoring, a centralized security dashboard, customized plugins, SSO, access control, cloud deployment options, and priority support with SLA guarantees.

      For a detailed comparison, visit our [pricing page](/pricing).
    `,
  },
  {
    question: 'How frequently should Promptfoo scans be run?',
    answer: dedent`
      We recommend integrating Promptfoo into your continuous integration process to catch vulnerabilities before they reach production. However, the optimal frequency depends on your development cycle and security needs.

      At minimum, scans should be run before major releases or significant changes to your LLM application.

      For best practices on integration, see our [CI/CD integration guide](/docs/integrations/ci-cd/).
    `,
  },
  {
    question: 'How does Promptfoo handle different LLM application architectures?',
    answer: dedent`
      Promptfoo is designed to work with various LLM application architectures, including RAG (Retrieval-Augmented Generation), agents, and chatbots.

      Our adaptive testing approach tailors the vulnerability scans to your specific architecture, ensuring comprehensive coverage.

      For more details on architecture-specific vulnerabilities, see our [LLM vulnerability types guide](/docs/red-team/llm-vulnerability-types/).
    `,
  },
  {
    question: 'Can Promptfoo help with OWASP LLM Top 10 compliance?',
    answer: dedent`
      Yes, Promptfoo directly addresses the OWASP LLM Top 10 vulnerabilities.

      Our platform includes specific plugins and strategies for each of the top 10 risks, helping you identify and mitigate these critical vulnerabilities.

      For a detailed breakdown, refer to our [OWASP LLM Top 10 guide](/docs/red-team/owasp-llm-top-10/).
    `,
  },
  {
    question: 'How does Promptfoo support continuous monitoring in production environments?',
    answer: dedent`
      Promptfoo offers continuous monitoring capabilities for production environments through our Enterprise version. This includes real-time alerts, automated evaluations, and integration with CI/CD pipelines.

      You can track vulnerability trends over time and receive notifications for new issues. Learn more about our [CI/CD integration](/docs/integrations/ci-cd/).
    `,
  },
  {
    question: 'What kind of reporting and analytics does Promptfoo provide?',
    answer: dedent`
      Promptfoo generates comprehensive reports that include detailed vulnerability assessments, risk scores, and actionable remediation steps.

      For Enterprise users, we offer a centralized analytics dashboard that provides a unified view of vulnerability status across all your LLM applications.

      This includes tracking of remediation progress and historical trend analysis.
    `,
  },
  {
    question: 'How does Promptfoo compare to traditional security scanning tools?',
    answer: dedent`
      Unlike traditional security scanners, Promptfoo is specifically designed for LLM applications. It uses dynamic adversarial testing and LLM-specific plugins to identify vulnerabilities that generic tools might miss.

      This includes issues like prompt injections, hallucinations, and model-specific weaknesses that are unique to AI systems.
    `,
  },
  {
    question: 'Can Promptfoo be used with any LLM provider?',
    answer: dedent`
      Yes, Promptfoo is compatible with a wide range of LLM providers, including OpenAI, Azure, Google Vertex, Amazon Bedrock, and many others.

      Our tool is designed to be provider-agnostic, allowing you to use it with your preferred LLM service or even with multiple providers simultaneously.
    `,
  },
  {
    question: 'How does Promptfoo handle data privacy during scans?',
    answer: dedent`
      Promptfoo takes data privacy seriously. For on-premises deployments, all scanning and analysis is done locally within your infrastructure, ensuring that sensitive data never leaves your environment.

      For cloud deployments, we employ strict data protection measures and offer options for data residency compliance.
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
