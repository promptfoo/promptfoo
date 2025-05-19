import React from 'react';
import styles from './A2AArchitectureVisualizer.module.css';

const communicationSteps = [
  {
    step: 1,
    title: 'Capability Discovery',
    description: 'Agents share their Agent Cards listing available capabilities',
    icon: '🔍',
  },
  {
    step: 2,
    title: 'Task Creation',
    description: 'Sales Agent creates a task to get technical review',
    icon: '📝',
  },
  {
    step: 3,
    title: 'Task Processing',
    description: 'Tech Agent processes the request and generates artifacts',
    icon: '⚙️',
  },
  {
    step: 4,
    title: 'Result Delivery',
    description: 'Results are returned with status updates via SSE',
    icon: '✅',
  },
];

export default function A2AArchitectureVisualizer() {
  return (
    <div className={styles.container}>
      <div className={styles.flowChart}>
        {communicationSteps.map((step, index) => (
          <React.Fragment key={step.step}>
            <div className={styles.flowStep}>
              <div className={styles.stepIcon}>{step.icon}</div>
              <h4>{step.title}</h4>
              <p>{step.description}</p>
            </div>
            {index < communicationSteps.length - 1 && <div className={styles.flowArrow}>→</div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
