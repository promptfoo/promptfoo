import React, { useState } from 'react';

interface TransportVisualizerProps {
  mode: 'stdio' | 'sse';
}

const MCPTransportVisualizer: React.FC<TransportVisualizerProps> = ({ mode }) => {
  const [messageCount, setMessageCount] = useState(0);
  const [lastMessage, setLastMessage] = useState('');

  const simulateMessage = () => {
    setMessageCount((prev) => prev + 1);
    setLastMessage(`Message ${messageCount + 1} sent via ${mode}`);
  };

  return (
    <div className="transport-visualizer">
      <div className="transport-header">
        <h4>{mode === 'stdio' ? 'Standard IO Transport' : 'Server-Sent Events Transport'}</h4>
        <button onClick={simulateMessage}>Simulate Message</button>
      </div>

      <div className="transport-diagram">
        {mode === 'stdio' ? (
          <div className="stdio-flow">
            <div className="process client">Client Process</div>
            <div className="pipe">stdin/stdout</div>
            <div className="process server">Server Process</div>
          </div>
        ) : (
          <div className="sse-flow">
            <div className="client">Client</div>
            <div className="connections">
              <div className="http-post">HTTP POST →</div>
              <div className="sse-stream">← SSE Stream</div>
            </div>
            <div className="server">Server</div>
          </div>
        )}
      </div>

      <div className="message-log">
        <p>Messages sent: {messageCount}</p>
        <p>Last message: {lastMessage}</p>
      </div>

      <style jsx>{`
        .transport-visualizer {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }

        .transport-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .transport-diagram {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 4px;
        }

        .stdio-flow,
        .sse-flow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .process,
        .client,
        .server {
          background: #fff;
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          min-width: 120px;
          text-align: center;
        }

        .pipe,
        .connections {
          flex: 1;
          text-align: center;
          color: #666;
        }

        .http-post,
        .sse-stream {
          margin: 5px 0;
          font-size: 0.9em;
        }

        .message-log {
          margin-top: 20px;
          padding: 10px;
          background: #f9f9f9;
          border-radius: 4px;
        }

        button {
          padding: 8px 16px;
          background: #0070f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        button:hover {
          background: #0051cc;
        }
      `}</style>
    </div>
  );
};

export default MCPTransportVisualizer;
