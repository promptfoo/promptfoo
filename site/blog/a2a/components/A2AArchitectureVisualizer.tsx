import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './A2AArchitectureVisualizer.module.css';

interface AgentCard {
  name: string;
  capabilities: string[];
  icon: string;
}

const agents: Record<string, AgentCard> = {
  salesAgent: {
    name: 'Sales Assistant',
    capabilities: ['Lead qualification', 'Meeting scheduling', 'Quote generation'],
    icon: '👩‍💼',
  },
  techAgent: {
    name: 'Tech Support',
    capabilities: ['Issue diagnosis', 'Code review', 'System monitoring'],
    icon: '👨‍💻',
  },
};

const communicationSteps = [
  {
    step: 1,
    title: 'Capability Discovery',
    description: 'Agents share their Agent Cards listing available capabilities',
    animation: 'cards',
  },
  {
    step: 2,
    title: 'Task Creation',
    description: 'Sales Agent creates a task to get technical review',
    animation: 'task',
  },
  {
    step: 3,
    title: 'Task Processing',
    description: 'Tech Agent processes the request and generates artifacts',
    animation: 'process',
  },
  {
    step: 4,
    title: 'Result Delivery',
    description: 'Results are returned with status updates via SSE',
    animation: 'result',
  },
];

export default function A2AArchitectureVisualizer() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const startDemo = () => {
    setIsPlaying(true);
    setActiveStep(0);
  };

  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setTimeout(() => {
        if (activeStep < communicationSteps.length - 1) {
          setActiveStep((prev) => prev + 1);
        } else {
          setIsPlaying(false);
        }
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [activeStep, isPlaying]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>How A2A Agents Collaborate</h3>
        <button className={styles.playButton} onClick={startDemo} disabled={isPlaying}>
          {isPlaying ? 'Watching Demo...' : 'Watch Demo'}
        </button>
      </div>

      <div className={styles.agentContainer}>
        {/* Left Agent */}
        <div className={styles.agent}>
          <div className={styles.agentIcon}>{agents.salesAgent.icon}</div>
          <h4>{agents.salesAgent.name}</h4>
          <div className={styles.capabilities}>
            {agents.salesAgent.capabilities.map((cap, idx) => (
              <div key={idx} className={styles.capability}>
                {cap}
              </div>
            ))}
          </div>
        </div>

        {/* Communication Area */}
        <div className={styles.communicationArea}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              className={styles.stepDisplay}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <div className={styles.stepNumber}>Step {communicationSteps[activeStep].step}</div>
              <h5>{communicationSteps[activeStep].title}</h5>
              <p>{communicationSteps[activeStep].description}</p>

              {/* Animation area based on step type */}
              <div className={styles.animationArea}>
                {communicationSteps[activeStep].animation === 'cards' && (
                  <motion.div
                    className={styles.agentCard}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    🗂️ Agent Cards Exchange
                  </motion.div>
                )}
                {communicationSteps[activeStep].animation === 'task' && (
                  <motion.div
                    className={styles.taskCreation}
                    initial={{ x: -50 }}
                    animate={{ x: 50 }}
                    transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
                  >
                    📝 Task Request
                  </motion.div>
                )}
                {communicationSteps[activeStep].animation === 'process' && (
                  <motion.div
                    className={styles.processing}
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
                  >
                    Processing<span className={styles.dots}>...</span>
                  </motion.div>
                )}
                {communicationSteps[activeStep].animation === 'result' && (
                  <motion.div
                    className={styles.result}
                    initial={{ x: 50 }}
                    animate={{ x: -50 }}
                    transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
                  >
                    📊 Results & Updates
                  </motion.div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Agent */}
        <div className={styles.agent}>
          <div className={styles.agentIcon}>{agents.techAgent.icon}</div>
          <h4>{agents.techAgent.name}</h4>
          <div className={styles.capabilities}>
            {agents.techAgent.capabilities.map((cap, idx) => (
              <div key={idx} className={styles.capability}>
                {cap}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
