import React from 'react';
import Link from '@docusaurus/Link';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import CodeBlock from '@theme/CodeBlock';
import styles from './styles.module.css';

export default function HomepageInfo(): JSX.Element {
  return (
    <div className={styles.infoContainer}>
      <section className={styles.section}>
        <h2>Easy abstractions for complex LLM testing</h2>
        <div className={styles.configToWebview}>
          <div className={styles.codeExample}>
            <div className={styles.featureTitle}>
              <SettingsIcon /> Simple declarative config
            </div>

            <CodeBlock language="yaml" className={styles.codeBlock}>
              {`
# Compare prompts...
prompts:
  - "Summarize this in {{language}}: {{document}}"
  - "Summarize this in {{language}}, concisely and professionally: {{document}}"

# And models...
providers:
  - openai:gpt-4o
  - anthropic:claude-3.5-sonnet

# ... using these tests
tests:
  - vars:
      language: French
      document: "file://docs/*.txt"
    assert:
      - type: contains
        value: "foo bar"
      - type: llm-rubric
        value: "does not apologize"
      - type: cost
        threshold: 0.01
      - type: latency
        threshold: 3000
  - # ...
              `}
            </CodeBlock>
          </div>
          <div className={styles.webviewExample}>
            <div className={styles.featureTitle}>
              <AssessmentIcon /> Detailed, actionable results
            </div>
            <Link to="https://user-images.githubusercontent.com/310310/261666627-ce5a7817-da82-4484-b26d-32474f1cabc5.png">
              <img
                loading="lazy"
                src="https://user-images.githubusercontent.com/310310/261666627-ce5a7817-da82-4484-b26d-32474f1cabc5.png"
                className={styles.resultImage}
              />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
