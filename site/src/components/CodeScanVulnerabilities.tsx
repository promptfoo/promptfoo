import React from 'react';

import styles from '../pages/landing-page.module.css';

export default function VulnerabilityTypesSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  const vulnerabilities = [
    {
      severity: 'critical',
      name: 'Prompt Injection',
      description: 'Untrusted input reaches LLM prompts without proper sanitization or boundaries.',
    },
    {
      severity: 'critical',
      name: 'Data Exfiltration',
      description: 'Indirect prompt injection vectors that could extract data through agent tools.',
    },
    {
      severity: 'high',
      name: 'PII Exposure',
      description:
        'Code that may leak sensitive user data to LLMs or log confidential information.',
    },
    {
      severity: 'high',
      name: 'Improper Output Handling',
      description: 'LLM outputs used in dangerous contexts like SQL queries or shell commands.',
    },
    {
      severity: 'medium',
      name: 'Excessive Agency',
      description: 'LLMs with overly broad tool access or missing approval gates for actions.',
    },
    {
      severity: 'medium',
      name: 'Jailbreak Risks',
      description: 'Weak system prompts and guardrail bypasses that could allow harmful outputs.',
    },
  ];

  return (
    <section className={styles.vulnerabilitySection}>
      <div className="container">
        <div className={styles.vulnEyebrow}>{eyebrow}</div>
        <h2 className={styles.vulnTitle}>{title}</h2>
        <p className={styles.vulnSubtitle}>{children}</p>
        <div className={styles.vulnGrid}>
          {vulnerabilities.map((vuln) => (
            <div key={vuln.name} className={styles.vulnCard}>
              <div className={`${styles.vulnSeverity} ${styles[vuln.severity]}`}>
                {vuln.severity}
              </div>
              <h3 className={styles.vulnName}>{vuln.name}</h3>
              <p className={styles.vulnDescription}>{vuln.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
