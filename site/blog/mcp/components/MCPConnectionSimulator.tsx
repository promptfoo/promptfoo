import React, { useState } from 'react';
import styles from '../styles/MCPConnectionSimulator.module.css';

interface Message {
  id: string;
  type: 'request' | 'response' | 'notification';
  content: string;
  direction: 'client-to-server' | 'server-to-client';
  phase: 'initialization' | 'operation' | 'shutdown';
}

interface ComponentStatus {
  connected: boolean;
  status: 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error';
  tooltip: string;
}

const MCPConnectionSimulator: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [clientStatus, setClientStatus] = useState<ComponentStatus>({
    connected: false,
    status: 'idle',
    tooltip: 'Ready to initialize connection',
  });
  const [serverStatus, setServerStatus] = useState<ComponentStatus>({
    connected: false,
    status: 'idle',
    tooltip: 'Waiting for connection',
  });
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const simulationSteps: Omit<Message, 'id'>[] = [
    // Initialization Phase
    {
      type: 'request',
      content: 'initialize {version: "1.0"}',
      direction: 'client-to-server',
      phase: 'initialization',
    },
    {
      type: 'response',
      content: 'version_ok {compatible: true}',
      direction: 'server-to-client',
      phase: 'initialization',
    },
    {
      type: 'request',
      content: 'share_capabilities {tools: ["sampling"], features: ["async"]}',
      direction: 'client-to-server',
      phase: 'initialization',
    },
    {
      type: 'response',
      content: 'capabilities {tools: ["file_read", "execute_command"], resources: ["workspace"]}',
      direction: 'server-to-client',
      phase: 'initialization',
    },
    {
      type: 'notification',
      content: 'ready',
      direction: 'client-to-server',
      phase: 'initialization',
    },
    // Operation Phase
    {
      type: 'request',
      content: 'invoke_tool {name: "file_read", params: {path: "example.txt"}}',
      direction: 'client-to-server',
      phase: 'operation',
    },
    {
      type: 'response',
      content: 'tool_result {content: "Hello World"}',
      direction: 'server-to-client',
      phase: 'operation',
    },
    {
      type: 'notification',
      content: 'file_changed {path: "example.txt"}',
      direction: 'server-to-client',
      phase: 'operation',
    },
    // Shutdown Phase
    {
      type: 'request',
      content: 'shutdown {reason: "work_complete"}',
      direction: 'client-to-server',
      phase: 'shutdown',
    },
    {
      type: 'response',
      content: 'shutdown_ok',
      direction: 'server-to-client',
      phase: 'shutdown',
    },
  ];

  const handleConnect = () => {
    setIsConnected(true);
    setMessages([]);
    setCurrentStep(0);
    setClientStatus({
      connected: false,
      status: 'connecting',
      tooltip: 'Initiating connection...',
    });
    setServerStatus({
      connected: false,
      status: 'connecting',
      tooltip: 'Receiving connection request...',
    });
  };

  const handleNextStep = () => {
    if (currentStep < simulationSteps.length) {
      const newMessage: Message = {
        id: `msg-${currentStep}`,
        ...simulationSteps[currentStep],
      };
      setMessages((prev) => [...prev, newMessage]);
      setCurrentStep((prev) => prev + 1);

      // Update status based on phase and step
      if (newMessage.phase === 'initialization') {
        if (currentStep < 4) {
          setClientStatus({
            connected: false,
            status: 'connecting',
            tooltip: 'Initializing connection...',
          });
          setServerStatus({
            connected: false,
            status: 'connecting',
            tooltip: 'Processing initialization...',
          });
        } else {
          setClientStatus({
            connected: true,
            status: 'connected',
            tooltip: 'Connection established',
          });
          setServerStatus({
            connected: true,
            status: 'connected',
            tooltip: 'Connection established',
          });
        }
      } else if (newMessage.phase === 'operation') {
        setClientStatus({
          connected: true,
          status: 'connected',
          tooltip: 'Actively communicating',
        });
        setServerStatus({
          connected: true,
          status: 'connected',
          tooltip: 'Processing requests',
        });
      } else if (newMessage.phase === 'shutdown') {
        setClientStatus({
          connected: false,
          status: 'disconnecting',
          tooltip: 'Shutting down connection',
        });
        setServerStatus({
          connected: false,
          status: 'disconnecting',
          tooltip: 'Closing connection',
        });
        if (currentStep === simulationSteps.length - 1) {
          setClientStatus({
            connected: false,
            status: 'idle',
            tooltip: 'Connection closed',
          });
          setServerStatus({
            connected: false,
            status: 'idle',
            tooltip: 'Connection closed',
          });
          setIsConnected(false);
        }
      }
    }
  };

  const handleReset = () => {
    setIsConnected(false);
    setMessages([]);
    setCurrentStep(0);
    setClientStatus({
      connected: false,
      status: 'idle',
      tooltip: 'Ready to initialize connection',
    });
    setServerStatus({
      connected: false,
      status: 'idle',
      tooltip: 'Waiting for connection',
    });
  };

  const getStatusIcon = (status: ComponentStatus['status']) => {
    switch (status) {
      case 'idle':
        return '○';
      case 'connecting':
        return '◌';
      case 'connected':
        return '●';
      case 'disconnecting':
        return '◌';
      case 'error':
        return '⊗';
      default:
        return '○';
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>MCP Connection Simulator</h3>
      </div>

      <div className={styles.simulator}>
        <div className={`${styles.client} ${styles[clientStatus.status]}`}>
          <div className={styles.componentHeader}>
            Client (IDE)
            <span className={styles.statusIcon}>●</span>
          </div>
          <div className={styles.componentBody}>
            <div
              className={styles.status}
              onMouseEnter={() => setShowTooltip('client')}
              onMouseLeave={() => setShowTooltip(null)}
            >
              Status: {clientStatus.status}
              {showTooltip === 'client' && (
                <div className={styles.tooltip}>{clientStatus.tooltip}</div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.messageFlow}>
          <div className={`${styles.connectionLine} ${isConnected ? styles.active : ''}`} />
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.message} ${styles[msg.direction]} ${styles[msg.type]}`}
              data-phase={msg.phase}
            >
              <div className={styles.messageContent}>
                <span className={styles.messageType}>{msg.type}</span>
                <code className={styles.messageText}>{msg.content}</code>
              </div>
            </div>
          ))}
        </div>

        <div className={`${styles.server} ${styles[serverStatus.status]}`}>
          <div className={styles.componentHeader}>
            Server (Tools)
            <span className={styles.statusIcon}>●</span>
          </div>
          <div className={styles.componentBody}>
            <div
              className={styles.status}
              onMouseEnter={() => setShowTooltip('server')}
              onMouseLeave={() => setShowTooltip(null)}
            >
              Status: {serverStatus.status}
              {showTooltip === 'server' && (
                <div className={styles.tooltip}>{serverStatus.tooltip}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        {isConnected ? (
          <>
            <button
              className={styles.button}
              onClick={handleNextStep}
              disabled={currentStep >= simulationSteps.length}
            >
              Next Step
            </button>
            <button className={styles.resetButton} onClick={handleReset}>
              Reset
            </button>
          </>
        ) : (
          <button className={styles.button} onClick={handleConnect}>
            Initialize Connection
          </button>
        )}
      </div>
    </div>
  );
};

export default MCPConnectionSimulator;
