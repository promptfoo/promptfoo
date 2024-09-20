import React, { useState } from 'react';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import CodeBlock from '@theme/CodeBlock';
import styles from './styles.module.css';

export default function HomepageInfo(): JSX.Element {
  const [activeTab, setActiveTab] = useState('security');

  const tabs = [
    { id: 'evaluations', label: 'Quality evaluations' },
    { id: 'security', label: 'Pre-deployment security scans' },
  ];

  const config = [
    {
      id: 'evaluations',
      code: `
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
      `,
      image:
        'https://user-images.githubusercontent.com/310310/261666627-ce5a7817-da82-4484-b26d-32474f1cabc5.png',
    },
    {
      id: 'security',
      code: `
# Test cases are generated to specifically target the system's use case
purpose: 'Budget travel agent'

# Define where payloads are sent
targets:
  - id: 'https://example.com/generate'
    config:
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        userInput: '{{prompt}}'
      `,
      image: '/img/risk-category-drawer@2x.png',
    },
  ];

  const activeConfig = config.find((item) => item.id === activeTab);

  return (
    <div className={styles.infoContainer}>
      <section className={styles.section}>
        <h2>Easy abstractions for complex LLM testing</h2>
        <div className={styles.exampleTabs}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.exampleTab} ${activeTab === tab.id ? styles.exampleTabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={styles.configToWebview}>
          <div className={styles.codeExample}>
            <div className={styles.featureTitle}>
              <SettingsIcon /> Simple declarative config
            </div>
            <CodeBlock language="yaml" className={styles.codeBlock}>
              {activeConfig.code}
            </CodeBlock>
          </div>
          <div className={styles.webviewExample}>
            <div className={styles.featureTitle}>
              <AssessmentIcon /> Detailed, actionable results
            </div>
            <img
              loading="lazy"
              src={activeConfig.image}
              className={styles.resultImage}
              alt={`${activeTab === 'evaluations' ? 'Evaluation' : 'Security'} Results`}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
