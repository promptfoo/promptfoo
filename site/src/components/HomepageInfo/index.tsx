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
          <h2 className={styles.blurb}>Used by 20,000+ developers at companies like</h2>
          <LogoContainer />
        </div>
      </section>
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.blurb}>... to rapidly improve prompts and evaluate models</h2>
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
  - openai:gpt-4-0125-preview
  - anthropic:claude-3-opus
  - mistral:mistral-large-latest

# ... using these tests
tests:
  - vars:
      language: French
      document: "To be or not to be, that is the question..."
    assert:
      - type: contains
        value: "Être ou ne pas être"
      - type: cost
        threshold: 0.01
      - type: latency
        threshold: 1000
      - type: llm-rubric
        value: does not apologize
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
      <section className={styles.section}>
        <div className="container">
          <h2 className={styles.blurb}>How it works</h2>
        </div>
      </section>
    </>
  );
}
