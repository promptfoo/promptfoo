import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './A2ACollaborationDemo.module.css';

interface Message {
  id: string;
  from: 'client' | 'remote';
  type: 'request' | 'ack' | 'context' | 'response' | 'status';
  content: string;
  timestamp: string;
  metadata?: {
    contextType?: string;
    statusType?: 'info' | 'success' | 'warning';
    ackId?: string;
  };
}

interface CollaborationScenario {
  name: string;
  description: string;
  messages: Message[];
  delayBetweenMessages: number;
}

const scenarios: Record<string, CollaborationScenario> = {
  'data-analysis': {
    name: 'Data Analysis Pipeline',
    description:
      'A client agent requests complex data analysis from a specialized analytics agent, demonstrating asynchronous processing and context sharing.',
    delayBetweenMessages: 2000,
    messages: [
      {
        id: 'msg1',
        from: 'client',
        type: 'request',
        content: 'Requesting analysis of Q3 sales data',
        timestamp: '10:00:00',
      },
      {
        id: 'msg2',
        from: 'remote',
        type: 'ack',
        content: 'Request received, initiating analysis pipeline',
        timestamp: '10:00:01',
        metadata: { ackId: 'msg1' },
      },
      {
        id: 'msg3',
        from: 'remote',
        type: 'context',
        content: 'Loading historical sales patterns for comparison',
        timestamp: '10:00:02',
        metadata: { contextType: 'data-context' },
      },
      {
        id: 'msg4',
        from: 'remote',
        type: 'status',
        content: 'Analysis 25% complete: Data validation finished',
        timestamp: '10:00:03',
        metadata: { statusType: 'info' },
      },
      {
        id: 'msg5',
        from: 'remote',
        type: 'status',
        content: 'Analysis 50% complete: Trend detection in progress',
        timestamp: '10:00:04',
        metadata: { statusType: 'info' },
      },
      {
        id: 'msg6',
        from: 'remote',
        type: 'context',
        content: 'Detected seasonal pattern, adjusting analysis parameters',
        timestamp: '10:00:05',
        metadata: { contextType: 'analysis-context' },
      },
      {
        id: 'msg7',
        from: 'remote',
        type: 'status',
        content: 'Analysis 75% complete: Generating insights',
        timestamp: '10:00:06',
        metadata: { statusType: 'info' },
      },
      {
        id: 'msg8',
        from: 'remote',
        type: 'response',
        content:
          'Analysis complete: 15% YoY growth, 3 anomalies detected, 5 actionable recommendations generated',
        timestamp: '10:00:07',
      },
      {
        id: 'msg9',
        from: 'client',
        type: 'ack',
        content: 'Results received and processed',
        timestamp: '10:00:08',
        metadata: { ackId: 'msg8' },
      },
    ],
  },
  'content-generation': {
    name: 'Content Generation',
    description:
      'A client agent collaborates with a creative agent to generate and refine content, showing iterative feedback and context preservation.',
    delayBetweenMessages: 2000,
    messages: [
      {
        id: 'msg1',
        from: 'client',
        type: 'request',
        content: 'Generate product description for eco-friendly water bottle',
        timestamp: '11:00:00',
      },
      {
        id: 'msg2',
        from: 'remote',
        type: 'ack',
        content: 'Request received, starting content generation',
        timestamp: '11:00:01',
        metadata: { ackId: 'msg1' },
      },
      {
        id: 'msg3',
        from: 'remote',
        type: 'context',
        content: 'Analyzing target audience preferences and market trends',
        timestamp: '11:00:02',
        metadata: { contextType: 'market-research' },
      },
      {
        id: 'msg4',
        from: 'remote',
        type: 'status',
        content: 'Draft 1 ready for review',
        timestamp: '11:00:03',
        metadata: { statusType: 'info' },
      },
      {
        id: 'msg5',
        from: 'client',
        type: 'context',
        content: 'Please emphasize sustainability features',
        timestamp: '11:00:04',
        metadata: { contextType: 'feedback' },
      },
      {
        id: 'msg6',
        from: 'remote',
        type: 'status',
        content: 'Refining content with sustainability focus',
        timestamp: '11:00:05',
        metadata: { statusType: 'info' },
      },
      {
        id: 'msg7',
        from: 'remote',
        type: 'response',
        content:
          'Final content ready: Highlights recycled materials, carbon-neutral manufacturing, and lifetime warranty',
        timestamp: '11:00:06',
      },
      {
        id: 'msg8',
        from: 'client',
        type: 'ack',
        content: 'Content approved for publication',
        timestamp: '11:00:07',
        metadata: { ackId: 'msg7' },
      },
    ],
  },
};

export default function A2ACollaborationDemo() {
  const [selectedScenario, setSelectedScenario] = useState<string>('data-analysis');
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const playScenario = async (scenarioKey: string) => {
    if (isPlaying) {
      return;
    }

    setIsPlaying(true);
    setDisplayedMessages([]);
    const scenario = scenarios[scenarioKey];

    for (const message of scenario.messages) {
      await new Promise((resolve) => setTimeout(resolve, scenario.delayBetweenMessages));
      setDisplayedMessages((prev) => [...prev, message]);
    }

    setIsPlaying(false);
  };

  const getMessageStyle = (message: Message) => {
    const baseClass = `${styles.message} ${styles[message.from]} ${styles[message.type]}`;
    if (message.metadata?.statusType) {
      return `${baseClass} ${styles[message.metadata.statusType]}`;
    }
    return baseClass;
  };

  return (
    <div className={styles.container}>
      <div className={styles.scenarioSelector}>
        <h4>Select Collaboration Scenario</h4>
        <div className={styles.scenarioButtons}>
          {Object.entries(scenarios).map(([key, scenario]) => (
            <button
              key={key}
              className={`${styles.scenarioButton} ${selectedScenario === key ? styles.active : ''}`}
              onClick={() => setSelectedScenario(key)}
              disabled={isPlaying}
            >
              {scenario.name}
            </button>
          ))}
        </div>
        <p className={styles.scenarioDescription}>{scenarios[selectedScenario].description}</p>
        <button
          className={styles.playButton}
          onClick={() => playScenario(selectedScenario)}
          disabled={isPlaying}
        >
          {isPlaying ? 'Running...' : 'Start'}
        </button>
      </div>

      <div className={styles.chatContainer}>
        <div className={styles.messageList}>
          <AnimatePresence>
            {displayedMessages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={getMessageStyle(message)}
              >
                <div className={styles.messageHeader}>
                  <span className={styles.messageFrom}>
                    {message.from === 'client' ? 'Client Agent' : 'Remote Agent'}
                  </span>
                  <span className={styles.messageTime}>{message.timestamp}</span>
                </div>
                <div className={styles.messageContent}>{message.content}</div>
                {message.metadata?.ackId && (
                  <div className={styles.messageAck}>
                    ↳ Acknowledging message {message.metadata.ackId}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
