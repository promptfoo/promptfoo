import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './MCPArchitectureVisualizer.module.css';

interface FlowStep {
  id: string;
  from: 'host' | 'client' | 'server';
  to: 'host' | 'client' | 'server';
  message: string;
  description: string;
}

// Example of a tool execution flow based on MCP protocol
const toolExecutionFlow: FlowStep[] = [
  {
    id: 'host-action',
    from: 'host',
    to: 'host',
    message: 'AI Assistant: "Let me create a ticket for that"',
    description: 'AI decides to use the create_ticket tool',
  },
  {
    id: 'tool-request-1',
    from: 'host',
    to: 'client',
    message: 'tools/call create_ticket',
    description: 'Client initiates ticket creation request',
  },
  {
    id: 'tool-request-2',
    from: 'client',
    to: 'server',
    message: '{ "method": "tools/call", "params": { "name": "create_ticket" } }',
    description: 'Server executes ticket creation tool',
  },
  {
    id: 'tool-response-1',
    from: 'server',
    to: 'client',
    message: '{ "result": { "ticketId": "123" } }',
    description: 'Server returns result',
  },
  {
    id: 'tool-response-2',
    from: 'client',
    to: 'host',
    message: 'Ticket #123 created successfully',
    description: 'Server Returns result to client',
  },
];

interface ComponentInfo {
  title: string;
  description: string;
  details: string;
  icon: string;
  role: string[];
}

const components: Record<string, ComponentInfo> = {
  host: {
    title: 'Host Application',
    description:
      'The AI-powered application (IDE, chat interface) that initiates requests for tools and context.',
    icon: '💻',
    role: [
      'Initiates tool execution requests',
      'Manages user interactions and sessions',
      'Coordinates with MCP clients',
      'Handles authentication and permissions',
    ],
    details:
      'The Host Application (like Cursor IDE or Claude Desktop) determines when to use tools and initiates requests. It manages user interactions and coordinates with MCP clients to execute tools and gather context.',
  },
  client: {
    title: 'MCP Client',
    description:
      'Handles the MCP protocol, routing messages between the Host and available Servers.',
    icon: '🔌',
    role: [
      'Routes tool execution requests',
      'Manages server connections',
      'Handles protocol versioning',
      'Ensures secure communication',
    ],
    details:
      'The MCP Client acts as a protocol handler and router. It maintains connections with servers, negotiates capabilities, and ensures proper message routing for tool execution and other requests.',
  },
  server: {
    title: 'Tool Server',
    description:
      'Provides specific tools or resources (e.g., file system, git) via the MCP protocol.',
    icon: '🛠️',
    role: [
      'Executes tool requests',
      'Implements security controls',
      'Manages resource access',
      'Reports available capabilities',
    ],
    details:
      'Tool Servers expose specific capabilities through the MCP protocol. Each server focuses on providing particular tools (like file operations, API integrations) and resources while handling security and access control.',
  },
};

const MCPArchitectureVisualizer: React.FC = () => {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [activeFlowStep, setActiveFlowStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isPlaying) {
      interval = setInterval(() => {
        setActiveFlowStep((prev) => {
          const next = (prev + 1) % toolExecutionFlow.length;
          if (next === 0) {
            setIsPlaying(false);
          }
          return next;
        });
      }, 2000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isPlaying]);

  const handleCardClick = (key: string) => {
    setExpandedCard(expandedCard === key ? null : key);
  };

  const handlePlayClick = () => {
    setActiveFlowStep(0);
    setIsPlaying(true);
  };

  const renderHostMessage = (step: FlowStep) => {
    if (step.from === 'host' && step.to === 'host') {
      return (
        <motion.div
          key={step.id}
          className={styles.flowMessage}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          data-from={step.from}
          data-to={step.to}
        >
          <code>{step.message}</code>
          <span className={styles.flowDescription}>{step.description}</span>
        </motion.div>
      );
    }
    return null;
  };

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <button className={styles.playButton} onClick={handlePlayClick} disabled={isPlaying}>
          {isPlaying ? 'Playing...' : 'Watch Tool Execution Flow'}
        </button>
      </div>

      <div className={styles.visualizer}>
        {Object.entries(components).map(([key, component], index) => (
          <div key={key} className={styles.cardWrapper}>
            {key === 'host' && (
              <div className={styles.hostMessageWrapper}>
                <AnimatePresence mode="wait">
                  {renderHostMessage(toolExecutionFlow[activeFlowStep])}
                </AnimatePresence>
              </div>
            )}

            <motion.div
              className={`${styles.card} ${expandedCard === key ? styles.expanded : ''}`}
              onClick={() => handleCardClick(key)}
              layout="position"
            >
              <motion.div className={styles.cardHeader} layout="position">
                <span className={styles.icon}>{component.icon}</span>
                <h3>{component.title}</h3>
              </motion.div>

              <motion.p className={styles.description} layout="position">
                {component.description}
              </motion.p>

              {expandedCard === key && (
                <div className={styles.expandedContent}>
                  <div className={styles.details}>
                    <p>{component.details}</p>
                    <h4>Key Responsibilities:</h4>
                    <ul>
                      {component.role.map((item, i) => (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                        >
                          {item}
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className={styles.cardFooter}>
                <button
                  className={styles.learnMore}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick(key);
                  }}
                >
                  {expandedCard === key ? 'Show less' : 'Learn more'}
                </button>
              </div>
            </motion.div>

            {/* Flow connector between cards */}
            {index < Object.entries(components).length - 1 && (
              <div className={styles.flowConnector}>
                <AnimatePresence mode="wait">
                  {toolExecutionFlow.map((step, stepIndex) => {
                    if (
                      stepIndex !== activeFlowStep ||
                      (step.from === 'host' && step.to === 'host')
                    ) {
                      return null;
                    }

                    const isFromThisCard = step.from === key;
                    // Only show the message on the "from" card
                    if (!isFromThisCard) {
                      return null;
                    }

                    return (
                      <motion.div
                        key={step.id}
                        className={`${styles.flowMessage} ${styles.right}`}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        data-from={step.from}
                        data-to={step.to}
                      >
                        <code>{step.message}</code>
                        <span className={styles.flowDescription}>{step.description}</span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MCPArchitectureVisualizer;
