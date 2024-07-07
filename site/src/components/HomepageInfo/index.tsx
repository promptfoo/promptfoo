import React from 'react';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import LogoContainer from '../LogoContainer';
import styles from './styles.module.css';

export default function HomepageInfo(): JSX.Element {
  return (
    <>
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.blurb}>Trusted by developers at</h2>
          <LogoContainer />
        </div>
      </section>
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.blurb}>... to rapidly improve LLM performance</h2>
        </div>
        <div className={styles.configToWebview}>
          <div className={styles.codeExample}>
            <p>Simple, declarative config</p>
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
            <p>Detailed, actionable results</p>
            <Link to="https://user-images.githubusercontent.com/310310/261666627-ce5a7817-da82-4484-b26d-32474f1cabc5.png">
              <img src="https://user-images.githubusercontent.com/310310/261666627-ce5a7817-da82-4484-b26d-32474f1cabc5.png" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
